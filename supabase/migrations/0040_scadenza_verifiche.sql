-- ============================================================
-- Le verifiche SCADONO, e il reddito del NUCLEO si documenta persona per persona.
--
-- Due buchi veri del sistema di fiducia:
--   1. una verifica non scadeva mai: un inquilino verificato a gennaio e licenziato a marzo aveva ancora il badge e i +50 punti a ottobre.
--      Ora ogni verifica ha una SCADENZA (reddito 6 mesi, protesti 3 mesi): dopo, non dà più punti né badge («verifica scaduta») finché non si rinnova.
--      Il rinnovo non crea buchi: se i documenti nuovi arrivano prima della scadenza, la verifica vecchia vale finché lo staff risponde.
--      La scadenza si CALCOLA quando si legge il dato (nessun lavoro periodico da cui dipendere); un lavoro periodico serve solo per i promemoria.
--   2. il reddito del nucleo non veniva confrontato con i documenti: «nucleo 3.000 €» con una sola busta paga da 1.500 € dava comunque il badge e i
--      +50 punti. Ora serve una prova del reddito PER OGNI persona del nucleo con un reddito (`redditi_nucleo`), lo staff scrive l'importo mensile che
--      ogni prova dimostra, e il «reddito verificato del nucleo» è la somma (una persona conta una volta sola). I punti sono proporzionali alla parte
--      documentata (fatto nell'app: lib/affidabilita.ts).
--   In più: «la tua situazione non è cambiata» (conferma, non sostituisce i documenti) e i documenti sostituiti da un rinnovo si cancellano.
-- I valori di validità stanno qui sotto (`validita_verifica`) e in lib/scadenze-verifiche.ts: un test li tiene allineati.
-- ============================================================

-- ---- 1. le colonne nuove ----
alter table tenant_profiles
  add column if not exists reddito_verificato_at timestamptz,
  add column if not exists reddito_scade_il timestamptz,
  add column if not exists reddito_nucleo_verificato integer,
  add column if not exists protesti_scade_il timestamptz,
  add column if not exists situazione_confermata_at timestamptz;
alter table tenant_profiles drop constraint if exists tenant_profiles_reddito_nucleo_verificato_check;
alter table tenant_profiles add constraint tenant_profiles_reddito_nucleo_verificato_check
  check (reddito_nucleo_verificato is null or reddito_nucleo_verificato >= 0);

-- Di chi è la prova del reddito (1 = la persona stessa, 2… = gli altri percettori del nucleo) e quanto dimostra, scritto dallo staff.
alter table documenti_inquilino
  add column if not exists persona smallint not null default 1,
  add column if not exists importo_verificato integer,
  add column if not exists verificato_at timestamptz;
alter table documenti_inquilino drop constraint if exists documenti_inquilino_persona_check;
alter table documenti_inquilino add constraint documenti_inquilino_persona_check check (persona between 1 and 6);
alter table documenti_inquilino drop constraint if exists documenti_inquilino_importo_check;
alter table documenti_inquilino add constraint documenti_inquilino_importo_check
  check (importo_verificato is null or (tipo = 'reddito' and importo_verificato > 0 and importo_verificato <= 100000));

-- L'inquilino registra i propri documenti, ma NON può scrivere da solo ciò che spetta allo staff (importo verificato, data di verifica): altrimenti un
-- documento in più con un importo a piacere finirebbe nella somma. Il limite sale da 12 a 20: con un nucleo di più percettori e un rinnovo i documenti
-- vecchi e nuovi convivono finché lo staff risponde.
drop policy if exists "documenti inquilino: li registra la persona" on documenti_inquilino;
create policy "documenti inquilino: li registra la persona" on documenti_inquilino
  for insert
  with check (
    tenant_id = auth.uid()
    and percorso like auth.uid()::text || '/inquilino-' || tipo || '-%'
    and (select count(*) from documenti_inquilino d where d.tenant_id = auth.uid()) < 20
    and importo_verificato is null
    and verificato_at is null
  );

-- Chi era già verificato prima di questa migrazione (dati di prova): la verifica vale da ora per un periodo intero, e si considera tutto il reddito
-- del nucleo come documentato (non c'erano importi); da adesso si fa sul serio.
update tenant_profiles
   set reddito_verificato_at = coalesce(verifica_inviata_at, now()),
       reddito_scade_il = now() + interval '6 months',
       reddito_nucleo_verificato = coalesce(reddito_nucleo, reddito_mensile, 0),
       situazione_confermata_at = now()
 where verificato and reddito_scade_il is null;
update tenant_profiles
   set protesti_scade_il = coalesce(protesti_verificati_at, now()) + interval '3 months'
 where protesti_verifica_stato = 'verificato' and protesti_scade_il is null;

-- ---- 2. quanto vale una verifica, e se vale ancora ----
create or replace function public.validita_verifica(p_tipo text)
returns interval
language sql
immutable
as $$
  select case p_tipo when 'reddito' then interval '6 months' when 'protesti' then interval '3 months' end
$$;

create or replace function public.reddito_valido(t tenant_profiles)
returns boolean
language sql
stable
as $$
  select coalesce(t.verificato and t.reddito_scade_il > now(), false)
$$;

create or replace function public.protesti_validi(t tenant_profiles)
returns boolean
language sql
stable
as $$
  select coalesce(t.protesti_scade_il > now(), false)
$$;

-- ---- 3. nessuno scrive a mano lo stato; i protesti si bloccano solo finché la verifica vale; cambiare i dati azzera la verifica ----
create or replace function public.proteggi_verifica_inquilino()
returns trigger
language plpgsql
as $$
begin
  -- chi lavora dal pannello SQL, o le funzioni sotto, non è limitato
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verificato := false;
    new.verifica_stato := 'non_avviata';
    new.verifica_esito_note := null;
    new.verifica_inviata_at := null;
    new.reddito_verificato_at := null;
    new.reddito_scade_il := null;
    new.reddito_nucleo_verificato := null;
    new.protesti_verifica_stato := 'non_avviata';
    new.protesti_verifica_esito_note := null;
    new.protesti_verifica_inviata_at := null;
    new.protesti_verificati_at := null;
    new.protesti_scade_il := null;
    new.situazione_confermata_at := null;
    return new;
  end if;

  if new.verificato is distinct from old.verificato
     or new.verifica_stato is distinct from old.verifica_stato
     or new.verifica_esito_note is distinct from old.verifica_esito_note
     or new.verifica_inviata_at is distinct from old.verifica_inviata_at
     or new.reddito_verificato_at is distinct from old.reddito_verificato_at
     or new.reddito_scade_il is distinct from old.reddito_scade_il
     or new.reddito_nucleo_verificato is distinct from old.reddito_nucleo_verificato
     or new.protesti_verifica_stato is distinct from old.protesti_verifica_stato
     or new.protesti_verifica_esito_note is distinct from old.protesti_verifica_esito_note
     or new.protesti_verifica_inviata_at is distinct from old.protesti_verifica_inviata_at
     or new.protesti_verificati_at is distinct from old.protesti_verificati_at
     or new.protesti_scade_il is distinct from old.protesti_scade_il
     or new.situazione_confermata_at is distinct from old.situazione_confermata_at then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;

  -- I protesti verificati dallo staff non si cambiano da soli FINCHÉ LA VERIFICA VALE (riscrivere lo stesso valore va bene).
  -- Scaduta la verifica, la risposta si può correggere: poi si rinnova.
  if old.protesti_scade_il is not null and old.protesti_scade_il > now() and new.protestato is distinct from old.protestato then
    raise exception 'PROTESTI_VERIFICATI: i protesti li ha verificati lo staff: per cambiarli scrivici'
      using errcode = 'P0001';
  end if;

  -- Cambiare lavoro, reddito o il numero di redditi del nucleo dopo la verifica la azzera (anche quella già scaduta)
  if old.verificato
     and (new.professione is distinct from old.professione
          or new.reddito_mensile is distinct from old.reddito_mensile
          or new.reddito_nucleo is distinct from old.reddito_nucleo
          or new.redditi_nucleo is distinct from old.redditi_nucleo) then
    new.verificato := false;
    new.verifica_stato := 'non_avviata';
    new.verifica_esito_note := 'Hai modificato lavoro o reddito dopo la verifica: va rifatta.';
    new.verifica_inviata_at := null;
    new.reddito_verificato_at := null;
    new.reddito_scade_il := null;
    new.reddito_nucleo_verificato := null;
  end if;

  return new;
end;
$$;

-- ---- 4. chiedere la verifica del reddito: la prima volta, o il RINNOVO quando sta per scadere o è scaduta ----
create or replace function public.richiedi_verifica_inquilino()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
  v_persone integer;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_t from tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'NON_INQUILINO';
  end if;

  if v_t.verifica_stato = 'in_verifica' then
    raise exception 'INQUILINO_GIA_IN_VERIFICA';
  end if;
  -- verificato, ancora valido per più di 30 giorni E con tutto il reddito del nucleo documentato (almeno il 95%): non c'è niente da rinnovare né da
  -- aggiungere. Se invece i documenti coprono solo una parte del reddito dichiarato, si può chiedere subito una nuova verifica (per aggiungere le prove degli altri).
  if v_t.verifica_stato = 'verificato' and v_t.reddito_scade_il is not null and v_t.reddito_scade_il > now() + interval '30 days'
     and coalesce(v_t.reddito_nucleo_verificato, 0) >= 0.95 * coalesce(nullif(v_t.reddito_nucleo, 0), v_t.reddito_mensile, 0) then
    raise exception 'INQUILINO_GIA_VERIFICATO';
  end if;

  -- lo staff confronta ciò che hai dichiarato con i documenti: senza una dichiarazione non c'è niente da confrontare
  if coalesce(trim(v_t.professione), '') = '' or coalesce(v_t.reddito_mensile, 0) <= 0 then
    raise exception 'DATI_PROFILO_MANCANTI';
  end if;

  if not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'identita') then
    raise exception 'DOCUMENTI_INQUILINO_MANCANTI';
  end if;

  -- una prova del reddito NUOVA (non già verificata) per ogni persona del nucleo con un reddito
  v_persone := least(6, greatest(1, coalesce(v_t.redditi_nucleo, 1)));
  if exists (
    select 1 from generate_series(1, v_persone) g
     where not exists (
       select 1 from documenti_inquilino d
        where d.tenant_id = auth.uid() and d.tipo = 'reddito' and d.persona = g and d.verificato_at is null)
  ) then
    raise exception 'DOCUMENTI_INQUILINO_MANCANTI';
  end if;

  -- `verificato` e la scadenza restano: la verifica vecchia vale finché lo staff risponde
  update tenant_profiles
     set verifica_stato = 'in_verifica',
         verifica_inviata_at = now(),
         verifica_esito_note = null
   where profile_id = auth.uid();
end;
$$;

-- ---- 5. l'esito dello staff sul reddito: ora con l'IMPORTO che ogni prova dimostra ----
drop function if exists public.esito_verifica_inquilino(uuid, boolean, text);
create or replace function public.esito_verifica_inquilino(p_tenant uuid, p_verificato boolean, p_note text, p_importi jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
  v_el jsonb;
  v_doc uuid;
  v_importo integer;
  v_persone integer;
  v_somma integer;
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;

  select * into v_t from tenant_profiles where profile_id = p_tenant;
  if not found then
    raise exception 'INQUILINO_INESISTENTE';
  end if;
  if v_t.verifica_stato <> 'in_verifica' then
    raise exception 'INQUILINO_NON_IN_VERIFICA';
  end if;

  if p_verificato then
    -- per sicurezza: nessun importo già presente (le persone non possono scriverlo, ma qui si riparte pulito) conta se lo staff non lo ha riconosciuto
    update documenti_inquilino set importo_verificato = null where tenant_id = p_tenant and tipo = 'reddito' and verificato_at is null;
    -- gli importi: [{"documento": "<id>", "importo": 1500}, …], uno per ogni prova del reddito che lo staff ha riconosciuto valida
    if p_importi is null or jsonb_typeof(p_importi) <> 'array' or jsonb_array_length(p_importi) = 0 then
      raise exception 'IMPORTI_OBBLIGATORI';
    end if;
    for v_el in select * from jsonb_array_elements(p_importi) loop
      begin
        v_doc := (v_el ->> 'documento')::uuid;
        v_importo := (v_el ->> 'importo')::integer;
      exception when others then
        raise exception 'IMPORTI_NON_VALIDI';
      end;
      if v_importo is null or v_importo <= 0 or v_importo > 100000 then
        raise exception 'IMPORTI_NON_VALIDI';
      end if;
      update documenti_inquilino
         set importo_verificato = v_importo
       where id = v_doc and tenant_id = p_tenant and tipo = 'reddito' and verificato_at is null;
      if not found then
        raise exception 'IMPORTI_NON_VALIDI';
      end if;
    end loop;

    -- ogni persona del nucleo con un reddito deve avere almeno una prova riconosciuta
    v_persone := least(6, greatest(1, coalesce(v_t.redditi_nucleo, 1)));
    if exists (
      select 1 from generate_series(1, v_persone) g
       where not exists (
         select 1 from documenti_inquilino d
          where d.tenant_id = p_tenant and d.tipo = 'reddito' and d.persona = g
            and d.verificato_at is null and d.importo_verificato is not null)
    ) then
      raise exception 'IMPORTI_PERSONE_MANCANTI';
    end if;

    -- il reddito del nucleo verificato: per ogni persona UNA sola prova (la più alta), sommate; una persona fuori dal nucleo non conta
    select coalesce(sum(m), 0) into v_somma
      from (select max(importo_verificato) as m
              from documenti_inquilino
             where tenant_id = p_tenant and tipo = 'reddito' and verificato_at is null
               and importo_verificato is not null and persona <= v_persone
             group by persona) x;

    -- i documenti SOSTITUITI (verificati in passato) e le prove nuove non riconosciute si cancellano: i file vanno nella coda di pulizia
    insert into file_da_eliminare (bucket, percorso)
    select 'documenti-verifica', percorso from documenti_inquilino
     where tenant_id = p_tenant
       and ((tipo = 'reddito' and (verificato_at is not null or importo_verificato is null))
         or (tipo = 'identita' and verificato_at is not null
             and exists (select 1 from documenti_inquilino n where n.tenant_id = p_tenant and n.tipo = 'identita' and n.verificato_at is null)))
    on conflict (bucket, percorso) do nothing;
    delete from documenti_inquilino
     where tenant_id = p_tenant
       and ((tipo = 'reddito' and (verificato_at is not null or importo_verificato is null))
         or (tipo = 'identita' and verificato_at is not null
             and exists (select 1 from documenti_inquilino n where n.tenant_id = p_tenant and n.tipo = 'identita' and n.verificato_at is null)));
    update documenti_inquilino set verificato_at = now()
     where tenant_id = p_tenant and tipo in ('identita', 'reddito') and verificato_at is null;

    update tenant_profiles
       set verificato = true,
           verifica_stato = 'verificato',
           verifica_esito_note = null,
           reddito_verificato_at = now(),
           reddito_scade_il = now() + public.validita_verifica('reddito'),
           reddito_nucleo_verificato = v_somma,
           situazione_confermata_at = now()
     where profile_id = p_tenant;
  else
    if p_note is null or length(trim(p_note)) < 3 then
      raise exception 'INQUILINO_NOTA_OBBLIGATORIA';
    end if;
    if v_t.verificato and v_t.reddito_scade_il is not null and v_t.reddito_scade_il > now() then
      -- era un RINNOVO e la verifica precedente vale ancora: resta valida; le prove nuove si scartano (così se ne carica di migliori)
      insert into file_da_eliminare (bucket, percorso)
      select 'documenti-verifica', percorso from documenti_inquilino
       where tenant_id = p_tenant and tipo = 'reddito' and verificato_at is null
      on conflict (bucket, percorso) do nothing;
      delete from documenti_inquilino where tenant_id = p_tenant and tipo = 'reddito' and verificato_at is null;
      update tenant_profiles
         set verifica_stato = 'verificato', verifica_esito_note = left(trim(p_note), 500)
       where profile_id = p_tenant;
    else
      update tenant_profiles
         set verificato = false, verifica_stato = 'non_avviata',
             verifica_esito_note = left(trim(p_note), 500),
             reddito_verificato_at = null, reddito_scade_il = null, reddito_nucleo_verificato = null
       where profile_id = p_tenant;
    end if;
  end if;
end;
$$;

-- chi legge la notifica deve distinguere un rinnovo respinto (la verifica vecchia resta) da una verifica riuscita
create or replace function public.notifica_reddito_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verifica_stato = 'in_verifica' and new.verifica_stato = 'verificato' then
    if new.verifica_esito_note is not null then
      perform public.crea_notifica(new.profile_id, 'reddito_respinto', '{}'::jsonb, '/profilo');
    else
      perform public.crea_notifica(new.profile_id, 'reddito_verificato', '{}'::jsonb, '/profilo');
    end if;
  elsif old.verifica_stato = 'in_verifica' and new.verifica_stato = 'non_avviata' then
    perform public.crea_notifica(new.profile_id, 'reddito_respinto', '{}'::jsonb, '/profilo');
  end if;
  return new;
end;
$$;

-- ---- 6. i protesti: stesso schema (scadenza, rinnovo, sostituzione dei documenti) ----
create or replace function public.richiedi_verifica_protesti()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO' using errcode = 'P0001';
  end if;

  select * into v_t from tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'NON_INQUILINO' using errcode = 'P0001';
  end if;

  if v_t.protesti_verifica_stato = 'in_verifica' then
    raise exception 'PROTESTI_GIA_IN_VERIFICA' using errcode = 'P0001';
  end if;
  if v_t.protesti_verifica_stato = 'verificato' and v_t.protesti_scade_il is not null and v_t.protesti_scade_il > now() + interval '30 days' then
    raise exception 'PROTESTI_GIA_VERIFICATI' using errcode = 'P0001';
  end if;

  -- lo staff confronta ciò che hai dichiarato con il certificato: senza una risposta non c'è niente da confrontare
  if v_t.protestato is null then
    raise exception 'PROTESTI_NON_DICHIARATI' using errcode = 'P0001';
  end if;

  -- il certificato deve essere NUOVO (non già verificato)
  if not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'identita')
     or not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'protesti' and verificato_at is null) then
    raise exception 'DOCUMENTI_PROTESTI_MANCANTI' using errcode = 'P0001';
  end if;

  update tenant_profiles
     set protesti_verifica_stato = 'in_verifica',
         protesti_verifica_inviata_at = now(),
         protesti_verifica_esito_note = null
   where profile_id = auth.uid();
end;
$$;

create or replace function public.esito_verifica_protesti(p_tenant uuid, p_esito text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF' using errcode = 'P0001';
  end if;
  if p_esito is null or p_esito not in ('nessun_protesto', 'protestato', 'respingi') then
    raise exception 'ESITO_NON_VALIDO' using errcode = 'P0001';
  end if;

  select * into v_t from tenant_profiles where profile_id = p_tenant;
  if not found then
    raise exception 'INQUILINO_INESISTENTE' using errcode = 'P0001';
  end if;
  if v_t.protesti_verifica_stato <> 'in_verifica' then
    raise exception 'PROTESTI_NON_IN_VERIFICA' using errcode = 'P0001';
  end if;

  if p_esito = 'respingi' then
    if p_note is null or length(btrim(p_note)) < 3 then
      raise exception 'PROTESTI_NOTA_OBBLIGATORIA' using errcode = 'P0001';
    end if;
    if v_t.protesti_scade_il is not null and v_t.protesti_scade_il > now() then
      -- era un RINNOVO e la verifica precedente vale ancora: resta valida, il certificato nuovo si scarta
      insert into file_da_eliminare (bucket, percorso)
      select 'documenti-verifica', percorso from documenti_inquilino
       where tenant_id = p_tenant and tipo = 'protesti' and verificato_at is null
      on conflict (bucket, percorso) do nothing;
      delete from documenti_inquilino where tenant_id = p_tenant and tipo = 'protesti' and verificato_at is null;
      update tenant_profiles
         set protesti_verifica_stato = 'verificato', protesti_verifica_esito_note = left(btrim(p_note), 500)
       where profile_id = p_tenant;
    else
      update tenant_profiles
         set protesti_verifica_stato = 'non_avviata',
             protesti_verifica_esito_note = left(btrim(p_note), 500),
             protesti_scade_il = null
       where profile_id = p_tenant;
    end if;
  else
    -- il certificato vecchio è sostituito: il file va nella coda di pulizia
    insert into file_da_eliminare (bucket, percorso)
    select 'documenti-verifica', percorso from documenti_inquilino
     where tenant_id = p_tenant and tipo = 'protesti' and verificato_at is not null
    on conflict (bucket, percorso) do nothing;
    delete from documenti_inquilino where tenant_id = p_tenant and tipo = 'protesti' and verificato_at is not null;
    update documenti_inquilino set verificato_at = now()
     where tenant_id = p_tenant and tipo in ('identita', 'protesti') and verificato_at is null;

    -- il risultato dello staff PREVALE su ciò che la persona aveva dichiarato
    update tenant_profiles
       set protestato = (p_esito = 'protestato'),
           protesti_verifica_stato = 'verificato',
           protesti_verificati_at = now(),
           protesti_scade_il = now() + public.validita_verifica('protesti'),
           protesti_verifica_esito_note = null
     where profile_id = p_tenant;
  end if;
end;
$$;

create or replace function public.notifica_protesti_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.protesti_verifica_stato = 'in_verifica' and new.protesti_verifica_stato = 'verificato' then
    if new.protesti_verifica_esito_note is not null then
      perform public.crea_notifica(new.profile_id, 'protesti_respinti', '{}'::jsonb, '/profilo');
    else
      perform public.crea_notifica(new.profile_id, 'protesti_verificati',
        jsonb_build_object('protestato', new.protestato), '/profilo');
    end if;
  elsif old.protesti_verifica_stato = 'in_verifica' and new.protesti_verifica_stato = 'non_avviata' then
    perform public.crea_notifica(new.profile_id, 'protesti_respinti', '{}'::jsonb, '/profilo');
  end if;
  return new;
end;
$$;

-- ---- 7. «la tua situazione non è cambiata» (lavoro e reddito): una conferma che non sostituisce i documenti ----
create or replace function public.conferma_situazione()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO' using errcode = 'P0001';
  end if;
  select * into v_t from tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'NON_INQUILINO' using errcode = 'P0001';
  end if;
  -- la conferma riguarda lavoro e reddito (la parte che può cambiare da un giorno all'altro): senza una verifica del reddito valida non c'è niente da
  -- confermare, si rinnova. I protesti non c'entrano: la loro verifica non rinfresca la conferma.
  if not public.reddito_valido(v_t) then
    raise exception 'NIENTE_DA_CONFERMARE' using errcode = 'P0001';
  end if;
  update tenant_profiles set situazione_confermata_at = now() where profile_id = auth.uid();
end;
$$;

-- ---- 8. cosa vede lo STAFF: quali sono rinnovi, la scadenza, quante persone nel nucleo ----
drop function if exists public.inquilini_da_verificare();
create or replace function public.inquilini_da_verificare()
returns table(tenant_id uuid, nome text, cognome text, inviata_at timestamptz, rinnovo boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;
  return query
    select t.profile_id, p.nome, p.cognome, t.verifica_inviata_at, (t.reddito_scade_il is not null)
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.verifica_stato = 'in_verifica'
     order by t.verifica_inviata_at nulls last;
end;
$$;

drop function if exists public.protesti_da_verificare();
create or replace function public.protesti_da_verificare()
returns table(tenant_id uuid, nome text, cognome text, inviata_at timestamptz, rinnovo boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF' using errcode = 'P0001';
  end if;
  return query
    select t.profile_id, p.nome, p.cognome, t.protesti_verifica_inviata_at, (t.protesti_scade_il is not null)
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.protesti_verifica_stato = 'in_verifica'
     order by t.protesti_verifica_inviata_at nulls last;
end;
$$;

drop function if exists public.dati_per_verifica_inquilino(uuid);
create or replace function public.dati_per_verifica_inquilino(p_tenant uuid)
returns table(nome text, cognome text, professione text, reddito_mensile integer, reddito_nucleo integer, redditi_nucleo integer, nucleo text,
              verifica_stato text, inviata_at timestamptz, reddito_scade_il timestamptz, reddito_nucleo_verificato integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;
  return query
    select p.nome, p.cognome, t.professione, t.reddito_mensile, t.reddito_nucleo, t.redditi_nucleo, t.nucleo::text,
           t.verifica_stato::text, t.verifica_inviata_at, t.reddito_scade_il, t.reddito_nucleo_verificato
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.profile_id = p_tenant;
end;
$$;

-- ---- 9. i PROMEMORIA: chi ha una verifica in scadenza (30 e 7 giorni prima) o scaduta riceve una notifica, una volta sola per scadenza ----
alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto', 'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto', 'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto', 'visita_prenotata', 'visita_annullata',
  'richiesta_ricevuta', 'richiesta_accettata',
  'candidatura_riaperta',
  'affitto_da_confermare', 'affitto_confermato', 'affitto_non_confermato',
  'protesti_verificati', 'protesti_respinti',
  'verifica_in_scadenza', 'verifica_scaduta'
));

-- chi è già stato avvisato di cosa (la stessa scadenza non avvisa due volte)
create table if not exists promemoria_verifiche (
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  tipo text not null check (tipo = 'reddito' or tipo = 'protesti'),
  scade_il timestamptz not null,
  soglia integer not null check (soglia in (30, 7, 0)),
  creato_il timestamptz not null default now(),
  primary key (tenant_id, tipo, scade_il, soglia)
);
alter table promemoria_verifiche enable row level security;
revoke all on promemoria_verifiche from anon, authenticated;

create or replace function public.promemoria_scadenze_verifiche()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_giorni integer;
  v_soglia integer;
  v_creati integer := 0;
  v_inserita integer;
begin
  for r in
    select t.profile_id, 'reddito'::text as tipo, t.reddito_scade_il as scade, t.verifica_stato::text as stato
      from tenant_profiles t where t.verificato and t.reddito_scade_il is not null
    union all
    select t.profile_id, 'protesti', t.protesti_scade_il, t.protesti_verifica_stato::text
      from tenant_profiles t where t.protesti_scade_il is not null
  loop
    -- chi ha già mandato il rinnovo non va stressato
    continue when r.stato = 'in_verifica';
    v_giorni := ceil(extract(epoch from (r.scade - now())) / 86400.0)::integer;
    if v_giorni <= 0 then v_soglia := 0;
    elsif v_giorni <= 7 then v_soglia := 7;
    elsif v_giorni <= 30 then v_soglia := 30;
    else continue;
    end if;

    insert into promemoria_verifiche (tenant_id, tipo, scade_il, soglia)
    values (r.profile_id, r.tipo, r.scade, v_soglia)
    on conflict do nothing;
    get diagnostics v_inserita = row_count;
    if v_inserita = 1 then
      perform public.crea_notifica(r.profile_id,
        case when v_soglia = 0 then 'verifica_scaduta' else 'verifica_in_scadenza' end,
        jsonb_build_object('tipo', r.tipo, 'giorni', greatest(v_giorni, 0), 'scade', to_char(r.scade at time zone 'Europe/Rome', 'YYYY-MM-DD')),
        '/profilo');
      v_creati := v_creati + 1;
    end if;
  end loop;
  return v_creati;
end;
$$;

-- ---- 10. il PROPRIETARIO vede la verifica solo se VALE (e quando è stata fatta, e quanta parte del reddito è documentata) ----
create or replace view public.candidati_del_proprietario
with (security_barrier = true) as
select
  c.id as candidatura_id,
  c.listing_id,
  c.tenant_id,
  c.status as stato,
  p.nome,
  p.cognome,
  case when c.status <> 'rifiutata' then t.professione end as professione,
  case when c.status <> 'rifiutata' then t.reddito_mensile end as reddito_mensile,
  case when c.status <> 'rifiutata' then t.reddito_nucleo end as reddito_nucleo,
  case when c.status <> 'rifiutata' then t.garante end as garante,
  case when c.status <> 'rifiutata' then t.fideiussione end as fideiussione,
  case when c.status <> 'rifiutata' then t.protestato end as protestato,
  case when c.status <> 'rifiutata' then public.reddito_valido(t) end as verificato,
  case when c.status <> 'rifiutata' then t.presentazione end as presentazione,
  case when c.status <> 'rifiutata' then t.avatar_url end as avatar_url,
  case when c.status <> 'rifiutata' then (t.animali is not null) end as animali_compilato,
  case when c.status <> 'rifiutata' then (t.nucleo is not null) end as nucleo_compilato,
  case when c.status <> 'rifiutata' then public.protesti_validi(t) end as protesti_verificati,
  case when c.status <> 'rifiutata' then (t.verificato and not public.reddito_valido(t)) end as reddito_scaduto,
  case when c.status <> 'rifiutata' then t.reddito_verificato_at end as reddito_verificato_at,
  case when c.status <> 'rifiutata' then t.reddito_nucleo_verificato end as reddito_nucleo_verificato,
  case when c.status <> 'rifiutata' then (t.protesti_scade_il is not null and not public.protesti_validi(t)) end as protesti_scaduti,
  case when c.status <> 'rifiutata' then t.protesti_verificati_at end as protesti_verificati_at,
  case when c.status <> 'rifiutata' then t.situazione_confermata_at end as situazione_confermata_at
from candidature c
join listings l on l.id = c.listing_id and l.owner_id = auth.uid()
join profiles p on p.id = c.tenant_id
left join tenant_profiles t on t.profile_id = c.tenant_id
where c.status::text <> 'ritirata';

revoke all on public.candidati_del_proprietario from public, anon;
grant select on public.candidati_del_proprietario to authenticated;

-- ---- 11. permessi ----
revoke all on function public.validita_verifica(text) from public, anon;
revoke all on function public.reddito_valido(tenant_profiles) from public, anon;
revoke all on function public.protesti_validi(tenant_profiles) from public, anon;
revoke all on function public.richiedi_verifica_inquilino() from public, anon;
revoke all on function public.esito_verifica_inquilino(uuid, boolean, text, jsonb) from public, anon;
revoke all on function public.richiedi_verifica_protesti() from public, anon;
revoke all on function public.esito_verifica_protesti(uuid, text, text) from public, anon;
revoke all on function public.conferma_situazione() from public, anon;
revoke all on function public.inquilini_da_verificare() from public, anon;
revoke all on function public.protesti_da_verificare() from public, anon;
revoke all on function public.dati_per_verifica_inquilino(uuid) from public, anon;
revoke all on function public.promemoria_scadenze_verifiche() from public, anon, authenticated;
grant execute on function public.validita_verifica(text) to authenticated, service_role;
grant execute on function public.reddito_valido(tenant_profiles) to authenticated, service_role;
grant execute on function public.protesti_validi(tenant_profiles) to authenticated, service_role;
grant execute on function public.richiedi_verifica_inquilino() to authenticated;
grant execute on function public.esito_verifica_inquilino(uuid, boolean, text, jsonb) to authenticated;
grant execute on function public.richiedi_verifica_protesti() to authenticated;
grant execute on function public.esito_verifica_protesti(uuid, text, text) to authenticated;
grant execute on function public.conferma_situazione() to authenticated;
grant execute on function public.inquilini_da_verificare() to authenticated;
grant execute on function public.protesti_da_verificare() to authenticated;
grant execute on function public.dati_per_verifica_inquilino(uuid) to authenticated;
-- i promemoria li lancia solo il server (chiave di servizio), mai una persona
grant execute on function public.promemoria_scadenze_verifiche() to service_role;
