-- ============================================================
-- MatchAmI — verifica del reddito dell'inquilino, con i documenti
--
-- Fin qui «reddito verificato» era un'etichetta che nessuno poteva far
-- diventare vera: la colonna esisteva, ma si cambiava solo a mano dal
-- pannello SQL. Ora l'inquilino carica i documenti, lo staff li controlla e
-- decide, e il proprietario vede soltanto l'esito: verificato sì o no.
--
-- Cosa si raccoglie, e cosa NO:
--   - un documento d'identità, per far coincidere il nome;
--   - una prova del reddito (busta paga, CU, dichiarazione).
--   Non si raccoglie lo stato di famiglia: dice la composizione del nucleo,
--   che l'app non usa e non mostra ai proprietari per scelta.
--
-- I file stanno nel bucket PRIVATO `documenti-verifica` (già esistente),
-- nella cartella della persona. Li vedono solo lei e lo staff. Il
-- proprietario non li vede mai.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cosa si ricorda di una verifica
-- ------------------------------------------------------------

alter table tenant_profiles
  add column if not exists verifica_esito_note text,
  add column if not exists verifica_inviata_at timestamptz;

-- ------------------------------------------------------------
-- 2. Chi può cambiare lo stato di verifica
--
-- Nessun utente: né verificato, né stato, né nota, né data. In più: se la
-- persona cambia i dati su cui è stata verificata (lavoro, reddito suo o del
-- nucleo), la verifica DECADE e va rifatta. Altrimenti «verificato»
-- resterebbe attaccato a un reddito diverso da quello controllato.
--
-- Garante, fideiussione e protesti non decadono: non si verificano con
-- questi documenti.
-- ------------------------------------------------------------

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
    return new;
  end if;

  if new.verificato is distinct from old.verificato
     or new.verifica_stato is distinct from old.verifica_stato
     or new.verifica_esito_note is distinct from old.verifica_esito_note
     or new.verifica_inviata_at is distinct from old.verifica_inviata_at then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
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

-- ------------------------------------------------------------
-- 3. I documenti dell'inquilino
-- ------------------------------------------------------------

create table if not exists documenti_inquilino (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  tipo text not null check (tipo in ('identita', 'reddito')),
  percorso text not null unique,
  nome_file text not null check (length(nome_file) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists documenti_inquilino_tenant_idx on documenti_inquilino (tenant_id);

alter table documenti_inquilino enable row level security;

-- Li legge la persona e lo staff. Mai un proprietario.
drop policy if exists "documenti inquilino: li legge la persona o lo staff" on documenti_inquilino;
create policy "documenti inquilino: li legge la persona o lo staff" on documenti_inquilino
  for select using (tenant_id = auth.uid() or is_staff());

-- Li registra la persona, nella propria cartella e con un nome che ne dice
-- il tipo. Al massimo 12: lo staff deve poterli sfogliare.
drop policy if exists "documenti inquilino: li registra la persona" on documenti_inquilino;
create policy "documenti inquilino: li registra la persona" on documenti_inquilino
  for insert with check (
    tenant_id = auth.uid()
    and percorso like auth.uid()::text || '/inquilino-' || tipo || '-%'
    and (select count(*) from documenti_inquilino d where d.tenant_id = auth.uid()) < 12
  );

-- Si può togliere un documento SOLO finché non si è inviato niente alla
-- verifica: un file caricato per sbaglio non resta lì. Dopo l'invio i
-- documenti non si toccano più (sono ciò che lo staff sta guardando).
drop policy if exists "documenti inquilino: li toglie la persona prima dell'invio" on documenti_inquilino;
create policy "documenti inquilino: li toglie la persona prima dell'invio" on documenti_inquilino
  for delete using (
    tenant_id = auth.uid()
    and exists (
      select 1 from tenant_profiles t
      where t.profile_id = auth.uid() and t.verifica_stato = 'non_avviata'
    )
  );

-- Lo stesso per il file vero. Solo i file `inquilino-...`: nella stessa
-- cartella ci sono anche i contratti degli affitti dichiarati, e quelli
-- non devono sparire da sotto gli occhi dello staff.
drop policy if exists "documenti-verifica: l'inquilino toglie i propri prima dell'invio" on storage.objects;
create policy "documenti-verifica: l'inquilino toglie i propri prima dell'invio" on storage.objects
  for delete to authenticated using (
    bucket_id = 'documenti-verifica'
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.filename(name) like 'inquilino-%'
    and exists (
      select 1 from tenant_profiles t
      where t.profile_id = auth.uid() and t.verifica_stato = 'non_avviata'
    )
  );

-- ------------------------------------------------------------
-- 4. Inviare per la verifica
-- ------------------------------------------------------------

create or replace function public.richiedi_verifica_inquilino()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tenant_profiles;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_t from tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'NON_INQUILINO';
  end if;

  if v_t.verifica_stato = 'verificato' then
    raise exception 'INQUILINO_GIA_VERIFICATO';
  end if;
  if v_t.verifica_stato = 'in_verifica' then
    raise exception 'INQUILINO_GIA_IN_VERIFICA';
  end if;

  -- lo staff confronta ciò che hai dichiarato con i documenti: senza una
  -- dichiarazione non c'è niente da confrontare
  if coalesce(trim(v_t.professione), '') = '' or coalesce(v_t.reddito_mensile, 0) <= 0 then
    raise exception 'DATI_PROFILO_MANCANTI';
  end if;

  if not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'identita')
     or not exists (select 1 from documenti_inquilino where tenant_id = auth.uid() and tipo = 'reddito') then
    raise exception 'DOCUMENTI_INQUILINO_MANCANTI';
  end if;

  update tenant_profiles
     set verifica_stato = 'in_verifica',
         verifica_inviata_at = now(),
         verifica_esito_note = null
   where profile_id = auth.uid();
end;
$$;

grant execute on function public.richiedi_verifica_inquilino() to authenticated;

-- ------------------------------------------------------------
-- 5. Lo staff: cosa vede, e la decisione
--
-- Lo staff NON legge il profilo intero: riceve solo ciò che serve a
-- confrontare la dichiarazione con i documenti (stesso principio della
-- vista dei candidati per i proprietari).
-- ------------------------------------------------------------

create or replace function public.inquilini_da_verificare()
returns table (tenant_id uuid, nome text, cognome text, inviata_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;

  return query
    select t.profile_id, p.nome, p.cognome, t.verifica_inviata_at
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.verifica_stato = 'in_verifica'
     order by t.verifica_inviata_at nulls last;
end;
$$;

create or replace function public.dati_per_verifica_inquilino(p_tenant uuid)
returns table (
  nome text, cognome text, professione text,
  reddito_mensile integer, reddito_nucleo integer,
  verifica_stato text, inviata_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;

  return query
    select p.nome, p.cognome, t.professione, t.reddito_mensile, t.reddito_nucleo,
           t.verifica_stato::text, t.verifica_inviata_at
      from tenant_profiles t
      join profiles p on p.id = t.profile_id
     where t.profile_id = p_tenant;
end;
$$;

create or replace function public.esito_verifica_inquilino(
  p_tenant uuid,
  p_verificato boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato stato_verifica;
begin
  if not is_staff() then
    raise exception 'NON_STAFF';
  end if;

  select verifica_stato into v_stato from tenant_profiles where profile_id = p_tenant;
  if not found then
    raise exception 'INQUILINO_INESISTENTE';
  end if;
  if v_stato <> 'in_verifica' then
    raise exception 'INQUILINO_NON_IN_VERIFICA';
  end if;

  if p_verificato then
    update tenant_profiles
       set verificato = true, verifica_stato = 'verificato', verifica_esito_note = null
     where profile_id = p_tenant;
  else
    if p_note is null or length(trim(p_note)) < 3 then
      raise exception 'INQUILINO_NOTA_OBBLIGATORIA';
    end if;
    update tenant_profiles
       set verificato = false, verifica_stato = 'non_avviata',
           verifica_esito_note = left(trim(p_note), 500)
     where profile_id = p_tenant;
  end if;
end;
$$;

grant execute on function public.inquilini_da_verificare() to authenticated;
grant execute on function public.dati_per_verifica_inquilino(uuid) to authenticated;
grant execute on function public.esito_verifica_inquilino(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables where table_name = 'documenti_inquilino';

select routine_name from information_schema.routines
where routine_name in ('richiedi_verifica_inquilino', 'inquilini_da_verificare',
                       'dati_per_verifica_inquilino', 'esito_verifica_inquilino')
order by 1;   -- 4 righe

select policyname from pg_policies where tablename = 'documenti_inquilino' order by 1;   -- 3 righe
