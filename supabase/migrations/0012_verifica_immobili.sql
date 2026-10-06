-- ============================================================
-- MatchAmI — verifica degli immobili, staff e annunci visibili solo
-- dopo la verifica
--
-- Il flusso:
--   1. un proprietario carica un immobile e i documenti che lo provano
--      (il proprio documento d'identità, e visura o atto dell'immobile);
--   2. li invia per la verifica;
--   3. lo staff li controlla e verifica o respinge, con una nota;
--   4. solo un immobile VERIFICATO diventa un annuncio visibile agli
--      inquilini, e solo allora il proprietario risulta verificato.
--
-- Questa migrazione scrive tutto nel database, così nessuna scorciatoia
-- dall'app può aggirarlo.
--
-- ATTENZIONE, effetto immediato: gli annunci esistenti non sono
-- verificati, quindi gli inquilini smettono di vederli finché non vengono
-- verificati. Se hai solo dati di prova, in fondo a questo file c'è un
-- comando per verificarli tutti in blocco. Non usarlo con dati veri.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chi è staff
--
-- Una tabella con gli id degli utenti che possono verificare. Ha la
-- sicurezza di riga attiva e NESSUNA policy: dall'API non si legge né si
-- scrive. Solo la funzione `is_staff()` la consulta, e risponde soltanto
-- per chi la chiama (non si può chiedere "questa persona è staff?").
--
-- Per aggiungere il primo membro, dal pannello SQL:
--   insert into staff (user_id)
--   select id from auth.users where email = 'la-tua-email@esempio.it';
-- ------------------------------------------------------------

create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table staff enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

grant execute on function public.is_staff() to authenticated;

-- ------------------------------------------------------------
-- 2. Lo stato di verifica lo cambiano solo le funzioni di questa
--    migrazione e chi amministra
--
-- La 0011 distingueva "chi amministra" da "chi chiama dall'app" guardando
-- se c'era un utente. Ora le funzioni qui sotto devono poter cambiare lo
-- stato PER CONTO di un utente (lo staff, con la sua sessione). Si
-- distingue allora dal ruolo con cui gira la richiesta: dall'API un utente
-- è sempre 'authenticated' o 'anon'; dentro una funzione `security definer`
-- è il proprietario della funzione; il pannello SQL è 'postgres'.
-- ------------------------------------------------------------

alter table listings
  add column if not exists verifica_esito_note text,
  add column if not exists verifica_inviata_at timestamptz;

create or replace function public.proteggi_verifica_immobile()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- pannello SQL, chiave di servizio, o funzione di questa migrazione
  end if;

  if tg_op = 'INSERT' then
    new.verifica_stato := 'non_avviata';
    new.verificato_at := null;
    new.verifica_esito_note := null;
    new.verifica_inviata_at := null;
  elsif new.verifica_stato is distinct from old.verifica_stato
     or new.verificato_at is distinct from old.verificato_at
     or new.verifica_esito_note is distinct from old.verifica_esito_note
     or new.verifica_inviata_at is distinct from old.verifica_inviata_at then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.proteggi_verifica_inquilino()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verificato := false;
    new.verifica_stato := 'non_avviata';
  elsif new.verificato is distinct from old.verificato
     or new.verifica_stato is distinct from old.verifica_stato then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Un annuncio è visibile agli inquilini solo se è verificato
--
-- Prima bastava `pubblicato`. Ora servono entrambe le cose. Il
-- proprietario vede sempre i suoi, e lo staff vede tutto per poter
-- verificare.
-- ------------------------------------------------------------

drop policy if exists "listings: read published" on listings;
create policy "listings: lettura" on listings
  for select using (
    (pubblicato = true and verifica_stato = 'verificato')
    or owner_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists "listing_photos: read with listing" on listing_photos;
create policy "listing_photos: lettura" on listing_photos
  for select using (
    exists (
      select 1 from listings l
      where l.id = listing_photos.listing_id
        and (
          (l.pubblicato = true and l.verifica_stato = 'verificato')
          or l.owner_id = auth.uid()
          or public.is_staff()
        )
    )
  );

-- Ci si può candidare solo a un annuncio visibile. Chiude anche un buco
-- trovato provando: prima si poteva inserire una candidatura su un
-- annuncio non pubblicato conoscendone l'id.
drop policy if exists "candidature: tenant creates" on candidature;
create policy "candidature: tenant creates" on candidature
  for insert
  with check (
    auth.uid() = tenant_id
    and status = 'in_attesa'
    and match_proprietario is null
    and match_proprietario_at is null
    and exists (
      select 1 from listings l
      where l.id = candidature.listing_id
        and l.pubblicato = true
        and l.verifica_stato = 'verificato'
    )
  );

-- Lo staff deve poter leggere nome e cognome di chi chiede la verifica.
drop policy if exists "profiles: staff reads" on profiles;
create policy "profiles: staff reads" on profiles
  for select using (public.is_staff());

-- ------------------------------------------------------------
-- 4. Documenti per la verifica
--
-- Bucket PRIVATO (a differenza delle foto): i documenti d'identità e
-- gli atti di proprietà non devono mai avere un indirizzo pubblico. Si
-- leggono con indirizzi temporanei, e solo il proprietario e lo staff
-- possono generarli.
--
-- Chi carica un file non lo può cancellare: così non si può togliere la
-- prova mentre è in verifica. I file si cancellano insieme all'account.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti-verifica', 'documenti-verifica', false,
  10485760,                                            -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

drop policy if exists "documenti-verifica: carica nella propria cartella" on storage.objects;
create policy "documenti-verifica: carica nella propria cartella" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documenti-verifica'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documenti-verifica: legge il proprietario o lo staff" on storage.objects;
create policy "documenti-verifica: legge il proprietario o lo staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documenti-verifica'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

create table if not exists documenti_verifica (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owner_profiles(profile_id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  tipo text not null check (tipo in ('identita', 'proprieta')),
  percorso text not null unique,
  nome_file text not null,
  created_at timestamptz not null default now(),
  -- l'identità è della persona, la prova di proprietà è di un immobile
  check (
    (tipo = 'proprieta' and listing_id is not null)
    or (tipo = 'identita' and listing_id is null)
  )
);

create index if not exists idx_documenti_owner on documenti_verifica(owner_id);
create index if not exists idx_documenti_listing on documenti_verifica(listing_id);

alter table documenti_verifica enable row level security;

create policy "documenti: legge il proprietario o lo staff" on documenti_verifica
  for select using (owner_id = auth.uid() or public.is_staff());

-- Si registra un documento solo nella propria cartella e, se è la prova di
-- un immobile, di un immobile proprio. Nessuna policy di UPDATE o DELETE.
create policy "documenti: il proprietario registra i suoi" on documenti_verifica
  for insert with check (
    owner_id = auth.uid()
    and percorso like auth.uid()::text || '/%'
    and (
      listing_id is null
      or exists (
        select 1 from listings l
        where l.id = documenti_verifica.listing_id and l.owner_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 5. Invio per la verifica e esito
-- ------------------------------------------------------------

-- Il proprietario invia un immobile. Servono il proprio documento
-- d'identità e almeno una prova di proprietà di QUELL'immobile.
create or replace function public.richiedi_verifica_immobile(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_listing from listings where id = p_listing and owner_id = auth.uid();
  if not found then
    raise exception 'IMMOBILE_NON_TUO';
  end if;
  if v_listing.verifica_stato = 'verificato' then
    raise exception 'GIA_VERIFICATO';
  end if;
  if v_listing.verifica_stato = 'in_verifica' then
    raise exception 'GIA_IN_VERIFICA';
  end if;

  if not exists (
       select 1 from documenti_verifica
        where owner_id = auth.uid() and tipo = 'identita')
     or not exists (
       select 1 from documenti_verifica
        where owner_id = auth.uid() and tipo = 'proprieta' and listing_id = p_listing)
  then
    raise exception 'DOCUMENTI_MANCANTI';
  end if;

  update listings
     set verifica_stato = 'in_verifica',
         verifica_inviata_at = now(),
         verifica_esito_note = null
   where id = p_listing;
end;
$$;

grant execute on function public.richiedi_verifica_immobile(uuid) to authenticated;

-- Lo staff verifica o respinge. Respingere richiede una nota, che il
-- proprietario legge per sapere cosa correggere.
create or replace function public.esito_verifica_immobile(
  p_listing uuid,
  p_verificato boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato stato_verifica;
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF';
  end if;

  select verifica_stato into v_stato from listings where id = p_listing;
  if not found then
    raise exception 'IMMOBILE_INESISTENTE';
  end if;
  if v_stato <> 'in_verifica' then
    raise exception 'NON_IN_VERIFICA';
  end if;

  if p_verificato then
    update listings
       set verifica_stato = 'verificato',
           verificato_at = now(),
           verifica_esito_note = null
     where id = p_listing;
  else
    if p_note is null or length(btrim(p_note)) < 3 then
      raise exception 'NOTA_OBBLIGATORIA';
    end if;
    update listings
       set verifica_stato = 'non_avviata',
           verificato_at = null,
           verifica_inviata_at = null,
           verifica_esito_note = btrim(p_note)
     where id = p_listing;
  end if;
end;
$$;

grant execute on function public.esito_verifica_immobile(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables
where table_name in ('staff', 'documenti_verifica') order by table_name;

select routine_name from information_schema.routines
where routine_name in ('is_staff', 'richiedi_verifica_immobile', 'esito_verifica_immobile')
order by routine_name;

select id, public from storage.buckets where id = 'documenti-verifica';  -- public deve essere false

select polname from pg_policy
where polrelid = 'listings'::regclass and polname = 'listings: lettura';


-- ============================================================
-- PER CHI AMMINISTRA
-- ============================================================
--
-- 1) Aggiungere il primo membro dello staff (una volta sola):
--
--      insert into staff (user_id)
--      select id from auth.users where email = 'la-tua-email@esempio.it';
--
--    Dopo aver fatto l'accesso con quell'account, il pannello si apre
--    all'indirizzo /staff.
--
-- 2) SOLO PER DATI DI PROVA: verificare in blocco tutti gli immobili
--    esistenti, così gli inquilini tornano a vederli. Non usarlo con
--    dati veri: toglie proprio il controllo che questa migrazione
--    introduce.
--
--      update listings
--         set verifica_stato = 'verificato', verificato_at = now();
-- ============================================================
