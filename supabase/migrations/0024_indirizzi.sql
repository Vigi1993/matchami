-- ============================================================
-- MatchAmI — indirizzo e posizione degli immobili
--
-- Nell'annuncio si vede solo la ZONA. L'indirizzo preciso si mostra dopo il
-- match: è ciò che dice la 0015, che aveva tolto la colonna `listings.indirizzo`
-- perché era leggibile da chiunque vedesse l'annuncio.
--
-- COME FUNZIONA
--   - l'indirizzo sta in una tabella SEPARATA, con la sicurezza a livello di
--     riga attiva e NESSUNA regola di lettura: nessuno la legge direttamente.
--     Si passa solo da funzioni che guardano chi chiama;
--   - lo vedono il proprietario dell'immobile e chi ha una candidatura
--     ACCETTATA su quell'immobile (il match). Chi non ha un match non ne
--     vede nemmeno l'esistenza;
--   - insieme all'indirizzo si registra la POSIZIONE sulla mappa e come è stata
--     ottenuta: `provvisoria` (un calcolo di prova) o `fornitore` (un servizio
--     di mappe vero). Quando si sceglierà il fornitore, le posizioni
--     provvisorie si riconoscono e si ricalcolano.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La tabella
-- ------------------------------------------------------------

create table if not exists indirizzi_immobili (
  listing_id        uuid primary key references listings(id) on delete cascade,
  via               text not null check (char_length(via) between 3 and 120),
  civico            text not null check (char_length(civico) between 1 and 12),
  cap               text not null check (cap ~ '^[0-9]{5}$'),
  citta             text not null default 'Milano' check (char_length(citta) between 2 and 60),
  latitudine        double precision not null check (latitudine between 35 and 48),
  longitudine       double precision not null check (longitudine between 6 and 19),
  origine_posizione text not null check (origine_posizione in ('provvisoria', 'fornitore')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Sicurezza a livello di riga attiva e NESSUNA policy: niente lettura diretta.
alter table indirizzi_immobili enable row level security;
revoke all on indirizzi_immobili from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Il proprietario imposta e toglie l'indirizzo di un suo immobile
-- ------------------------------------------------------------

create or replace function public.imposta_indirizzo(
  p_listing uuid,
  p_via text,
  p_civico text,
  p_cap text,
  p_citta text,
  p_latitudine double precision,
  p_longitudine double precision,
  p_origine text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_via text := btrim(regexp_replace(coalesce(p_via, ''), '\s+', ' ', 'g'));
  v_civico text := btrim(regexp_replace(coalesce(p_civico, ''), '\s+', ' ', 'g'));
  v_cap text := btrim(coalesce(p_cap, ''));
  v_citta text := btrim(regexp_replace(coalesce(p_citta, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if not exists (select 1 from listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'IMMOBILE_NON_TUO';
  end if;

  if char_length(v_via) not between 3 and 120
     or char_length(v_civico) not between 1 and 12
     or v_cap !~ '^[0-9]{5}$'
     or char_length(v_citta) not between 2 and 60 then
    raise exception 'INDIRIZZO_IMMOBILE_NON_VALIDO';
  end if;

  if p_latitudine is null or p_longitudine is null
     or p_latitudine not between 35 and 48
     or p_longitudine not between 6 and 19 then
    raise exception 'POSIZIONE_NON_VALIDA';
  end if;

  if p_origine is null or p_origine not in ('provvisoria', 'fornitore') then
    raise exception 'ORIGINE_NON_VALIDA';
  end if;

  insert into indirizzi_immobili
    (listing_id, via, civico, cap, citta, latitudine, longitudine, origine_posizione)
  values
    (p_listing, v_via, v_civico, v_cap, v_citta, p_latitudine, p_longitudine, p_origine)
  on conflict (listing_id) do update set
    via = excluded.via,
    civico = excluded.civico,
    cap = excluded.cap,
    citta = excluded.citta,
    latitudine = excluded.latitudine,
    longitudine = excluded.longitudine,
    origine_posizione = excluded.origine_posizione,
    updated_at = now();
end;
$$;

create or replace function public.rimuovi_indirizzo(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  if not exists (select 1 from listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'IMMOBILE_NON_TUO';
  end if;
  delete from indirizzi_immobili where listing_id = p_listing;
end;
$$;

-- ------------------------------------------------------------
-- 3. Cosa si legge
-- ------------------------------------------------------------

-- Gli indirizzi dei MIEI immobili, per il proprietario.
create or replace function public.indirizzi_dei_miei_immobili()
returns table (
  listing_id uuid,
  via text,
  civico text,
  cap text,
  citta text,
  latitudine double precision,
  longitudine double precision,
  origine_posizione text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.listing_id, a.via, a.civico, a.cap, a.citta, a.latitudine, a.longitudine, a.origine_posizione
    from indirizzi_immobili a
    join listings l on l.id = a.listing_id
   where auth.uid() is not null
     and l.owner_id = auth.uid();
$$;

-- L'indirizzo dell'immobile di UNA candidatura: lo legge il proprietario
-- dell'immobile, o l'inquilino SOLO se la candidatura è stata accettata. Per
-- chiunque altro, e per una candidatura non accettata, non c'è niente: nemmeno
-- si capisce se l'indirizzo esiste.
create or replace function public.indirizzo_per_candidatura(p_candidatura uuid)
returns table (
  via text,
  civico text,
  cap text,
  citta text,
  latitudine double precision,
  longitudine double precision,
  origine_posizione text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.via, a.civico, a.cap, a.citta, a.latitudine, a.longitudine, a.origine_posizione
    from candidature c
    join listings l on l.id = c.listing_id
    join indirizzi_immobili a on a.listing_id = c.listing_id
   where auth.uid() is not null
     and c.id = p_candidatura
     and c.status = 'accettata'
     and (c.tenant_id = auth.uid() or l.owner_id = auth.uid());
$$;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

revoke all on function
  public.imposta_indirizzo(uuid, text, text, text, text, double precision, double precision, text),
  public.rimuovi_indirizzo(uuid),
  public.indirizzi_dei_miei_immobili(),
  public.indirizzo_per_candidatura(uuid)
from public, anon;

grant execute on function
  public.imposta_indirizzo(uuid, text, text, text, text, double precision, double precision, text),
  public.rimuovi_indirizzo(uuid),
  public.indirizzi_dei_miei_immobili(),
  public.indirizzo_per_candidatura(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('imposta_indirizzo', 'rimuovi_indirizzo', 'indirizzi_dei_miei_immobili', 'indirizzo_per_candidatura')
order by 1;   -- 4 righe

-- devono risultare 0: nessuna policy e nessun permesso diretto sulla tabella
select count(*) as policy_sulla_tabella from pg_policies where tablename = 'indirizzi_immobili';
select count(*) as permessi_diretti_per_gli_utenti
from information_schema.role_table_grants
where table_name = 'indirizzi_immobili' and grantee in ('authenticated', 'anon');
