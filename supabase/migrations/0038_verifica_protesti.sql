-- ============================================================
-- Il fatto di essere o no protestati lo VERIFICA lo staff.
--
-- Finora i protesti erano solo una risposta dell'inquilino («nessuno controlla»). Ora c'è un percorso di verifica, SEPARATO da quello del reddito (si può far
-- verificare l'uno senza l'altro), con lo stesso schema:
--   1. l'inquilino ha già risposto alla domanda sui protesti (obbligatoria) e carica il certificato dei protesti (+ il documento d'identità, lo stesso del reddito);
--   2. chiede la verifica: lo stato passa a «in verifica»;
--   3. lo staff guarda i documenti e decide: «nessun protesto», «ci sono protesti» oppure «respinto» (con una nota: documento illeggibile, nome diverso...);
--   4. se verificato, il risultato dello staff PREVALE su ciò che l'inquilino aveva dichiarato (la colonna protestato prende il valore verificato) e da quel momento la
--      risposta NON si cambia più da soli: altrimenti si potrebbe ribaltare dopo il controllo. Per cambiarla si scrive allo staff.
-- Il punteggio non cambia: la voce «protesti» pesa quanto prima; cambia che adesso può essere «verificata» e lo si vede (a chi la guarda e ai proprietari).
-- Il proprietario vede solo «protesti verificati: sì/no» (mai i documenti). Nessun dato nuovo oltre ai documenti che la persona carica apposta per lo staff.
-- ============================================================

-- ---- 1. un nuovo tipo di documento ----
alter table documenti_inquilino drop constraint if exists documenti_inquilino_tipo_check;
alter table documenti_inquilino add constraint documenti_inquilino_tipo_check check (tipo in ('identita', 'reddito', 'protesti'));

-- ---- 2. lo stato della verifica dei protesti ----
alter table tenant_profiles
  add column if not exists protesti_verifica_stato stato_verifica not null default 'non_avviata',
  add column if not exists protesti_verifica_inviata_at timestamptz,
  add column if not exists protesti_verifica_esito_note text,
  add column if not exists protesti_verificati_at timestamptz;

-- ---- 3. nessuno scrive a mano lo stato; i protesti verificati non si cambiano da soli ----
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
    new.protesti_verifica_stato := 'non_avviata';
    new.protesti_verifica_esito_note := null;
    new.protesti_verifica_inviata_at := null;
    new.protesti_verificati_at := null;
    return new;
  end if;

  if new.verificato is distinct from old.verificato
     or new.verifica_stato is distinct from old.verifica_stato
     or new.verifica_esito_note is distinct from old.verifica_esito_note
     or new.verifica_inviata_at is distinct from old.verifica_inviata_at
     or new.protesti_verifica_stato is distinct from old.protesti_verifica_stato
     or new.protesti_verifica_esito_note is distinct from old.protesti_verifica_esito_note
     or new.protesti_verifica_inviata_at is distinct from old.protesti_verifica_inviata_at
     or new.protesti_verificati_at is distinct from old.protesti_verificati_at then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;

  -- I protesti verificati dallo staff non si cambiano da soli (riscrivere lo stesso valore va bene)
  if old.protesti_verifica_stato = 'verificato' and new.protestato is distinct from old.protestato then
    raise exception 'PROTESTI_VERIFICATI: i protesti li ha verificati lo staff: per cambiarli scrivici'
      using errcode = 'P0001';
  end if;

  if old.verificato
     and (new.professione is distinct from old.professione
          or new.reddito_mensile is distinct from old.reddito_mensile
          or new.reddito_nucleo is distinct from old.reddito_nucleo) then
    new.verificato := false;
    new.verifica_stato := 'non_avviata';
    new.verifica_esito_note := 'Hai modificato lavoro o reddito dopo la verifica: va rifatta.';
    new.verifica_inviata_at := null;
  end if;

  return new;
end;
$$;

-- ---- 4. i documenti si tolgono solo finché NON sono stati inviati alla verifica a cui servono ----
-- il certificato dei protesti dipende dalla verifica dei protesti, la prova del reddito da quella del reddito,
-- il documento d'identità serve a tutte e due: si toglie solo se nessuna è partita
drop policy if exists "documenti inquilino: li toglie la persona prima dell'invio" on documenti_inquilino;
create policy "documenti inquilino: li toglie la persona prima dell'invio" on documenti_inquilino for delete to authenticated
  using (
    tenant_id = auth.uid()
    and exists (
      select 1 from tenant_profiles t
       where t.profile_id = auth.uid()
         and case documenti_inquilino.tipo
               when 'protesti' then t.protesti_verifica_stato = 'non_avviata'
               when 'reddito' then t.verifica_stato = 'non_avviata'
               else t.verifica_stato = 'non_avviata' and t.protesti_verifica_stato = 'non_avviata'
             end
    )
  );

drop policy if exists "documenti-verifica: l'inquilino toglie i propri prima dell'invio" on storage.objects;
drop policy if exists "documenti-verifica: l'inquilino toglie i propri prima dell'invi" on storage.objects;
create policy "documenti-verifica: l'inquilino toglie i propri prima dell'invio" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documenti-verifica'
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.filename(name) like 'inquilino-%'
    and exists (
      select 1 from tenant_profiles t
       where t.profile_id = auth.uid()
         and case
               when storage.filename(name) like 'inquilino-protesti-%' then t.protesti_verifica_stato = 'non_avviata'
               when storage.filename(name) like 'inquilino-reddito-%' then t.verifica_stato = 'non_avviata'
               else t.verifica_stato = 'non_avviata' and t.protesti_verifica_stato = 'non_avviata'
             end
    )
  );

-- ---- 5. l'inquilino chiede la verifica dei protesti ----
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

  if v_t.protesti_verifica_stato = 'verificato' then
    raise exception 'PROTESTI_GIA_VERIFICATI' using errcode = 'P0001';
  end if;
  if v_t.protesti_verifica_stato = 'in_verifica' then
    raise exception 'PROTESTI_GIA_IN_VERIFICA' using errcode = 'P0001';
  end if;

  -- lo staff confronta ciò che hai dichiarato con il certificato: senza una risposta non c'è niente da confrontare
  if v_t.protestato is null then
    raise exception 'PROTESTI_NON_DICHIARATI' using errcode = 'P0001';
  end if;

  if not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'identita')
     or not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'protesti') then
    raise exception 'DOCUMENTI_PROTESTI_MANCANTI' using errcode = 'P0001';
  end if;

  update tenant_profiles
     set protesti_verifica_stato = 'in_verifica',
         protesti_verifica_inviata_at = now(),
         protesti_verifica_esito_note = null
   where profile_id = auth.uid();
end;
$$;

-- ---- 6. lo staff decide ----
-- p_esito: 'nessun_protesto' | 'protestato' | 'respingi' (con una nota)
create or replace function public.esito_verifica_protesti(p_tenant uuid, p_esito text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato stato_verifica;
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF' using errcode = 'P0001';
  end if;
  if p_esito is null or p_esito not in ('nessun_protesto', 'protestato', 'respingi') then
    raise exception 'ESITO_NON_VALIDO' using errcode = 'P0001';
  end if;

  select protesti_verifica_stato into v_stato from tenant_profiles where profile_id = p_tenant;
  if not found then
    raise exception 'INQUILINO_INESISTENTE' using errcode = 'P0001';
  end if;
  if v_stato <> 'in_verifica' then
    raise exception 'PROTESTI_NON_IN_VERIFICA' using errcode = 'P0001';
  end if;

  if p_esito = 'respingi' then
    if p_note is null or length(btrim(p_note)) < 3 then
      raise exception 'PROTESTI_NOTA_OBBLIGATORIA' using errcode = 'P0001';
    end if;
    update tenant_profiles
       set protesti_verifica_stato = 'non_avviata',
           protesti_verifica_esito_note = left(btrim(p_note), 500)
     where profile_id = p_tenant;
  else
    -- il risultato dello staff PREVALE su ciò che la persona aveva dichiarato
    update tenant_profiles
       set protestato = (p_esito = 'protestato'),
           protesti_verifica_stato = 'verificato',
           protesti_verificati_at = now(),
           protesti_verifica_esito_note = null
     where profile_id = p_tenant;
  end if;
end;
$$;

-- ---- 7. quello che serve allo staff (non legge i profili: ha solo queste due funzioni) ----
create or replace function public.protesti_da_verificare()
returns table(tenant_id uuid, nome text, cognome text, inviata_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF' using errcode = 'P0001';
  end if;
  return query
    select t.profile_id, p.nome, p.cognome, t.protesti_verifica_inviata_at
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.protesti_verifica_stato = 'in_verifica'
     order by t.protesti_verifica_inviata_at nulls last;
end;
$$;

create or replace function public.dati_per_verifica_protesti(p_tenant uuid)
returns table(nome text, cognome text, protestato boolean, protesti_verifica_stato text, inviata_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF' using errcode = 'P0001';
  end if;
  return query
    select p.nome, p.cognome, t.protestato, t.protesti_verifica_stato::text, t.protesti_verifica_inviata_at
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.profile_id = p_tenant;
end;
$$;

revoke all on function public.richiedi_verifica_protesti() from public, anon;
revoke all on function public.esito_verifica_protesti(uuid, text, text) from public, anon;
revoke all on function public.protesti_da_verificare() from public, anon;
revoke all on function public.dati_per_verifica_protesti(uuid) from public, anon;
grant execute on function public.richiedi_verifica_protesti() to authenticated;
grant execute on function public.esito_verifica_protesti(uuid, text, text) to authenticated;
grant execute on function public.protesti_da_verificare() to authenticated;
grant execute on function public.dati_per_verifica_protesti(uuid) to authenticated;

-- ---- 8. l'inquilino viene avvisato dell'esito ----
alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto', 'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto', 'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto', 'visita_prenotata', 'visita_annullata',
  'richiesta_ricevuta', 'richiesta_accettata',
  'candidatura_riaperta',
  'affitto_da_confermare', 'affitto_confermato', 'affitto_non_confermato',
  'protesti_verificati', 'protesti_respinti'
));

create or replace function public.notifica_protesti_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.protesti_verifica_stato = 'in_verifica' and new.protesti_verifica_stato = 'verificato' then
    perform public.crea_notifica(new.profile_id, 'protesti_verificati',
      jsonb_build_object('protestato', new.protestato), '/profilo');
  elsif old.protesti_verifica_stato = 'in_verifica' and new.protesti_verifica_stato = 'non_avviata' then
    perform public.crea_notifica(new.profile_id, 'protesti_respinti', '{}'::jsonb, '/profilo');
  end if;
  return new;
end;
$$;
drop trigger if exists notifica_protesti_esito on tenant_profiles;
create trigger notifica_protesti_esito after update of protesti_verifica_stato on tenant_profiles
  for each row execute function public.notifica_protesti_esito();

-- ---- 9. il proprietario vede SOLO se i protesti sono verificati (sì/no), mai i documenti ----
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
  case when c.status <> 'rifiutata' then t.verificato end as verificato,
  case when c.status <> 'rifiutata' then t.presentazione end as presentazione,
  case when c.status <> 'rifiutata' then t.avatar_url end as avatar_url,
  case when c.status <> 'rifiutata' then (t.animali is not null) end as animali_compilato,
  case when c.status <> 'rifiutata' then (t.nucleo is not null) end as nucleo_compilato,
  case when c.status <> 'rifiutata' then (t.protesti_verifica_stato = 'verificato') end as protesti_verificati
from candidature c
join listings l on l.id = c.listing_id and l.owner_id = auth.uid()
join profiles p on p.id = c.tenant_id
left join tenant_profiles t on t.profile_id = c.tenant_id
where c.status::text <> 'ritirata';

revoke all on public.candidati_del_proprietario from public, anon;
grant select on public.candidati_del_proprietario to authenticated;
