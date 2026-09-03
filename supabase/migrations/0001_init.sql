-- ============================================================
-- MatchAmI — schema iniziale (Fase 1: Modello dati)
-- Target: Postgres su Supabase
-- Convenzioni:
--   - id sempre uuid, default gen_random_uuid()
--   - timestamp sempre timestamptz, default now()
--   - una riga "profiles" per ogni utente autenticato (auth.users)
--   - dati specifici del ruolo separati in tabelle proprie
--     (tenant_profiles / owner_profiles) invece di un unico
--     oggetto "profile" gigante come nel prototipo HTML
-- ============================================================

create extension if not exists "pgcrypto"; -- per gen_random_uuid()

-- ============================================================
-- ENUM
-- ============================================================

create type ruolo_utente as enum ('inquilino', 'proprietario');
create type stato_candidatura as enum ('in_attesa', 'accettata', 'rifiutata');
create type stato_contratto as enum ('bozza', 'in_firma', 'firmato', 'concluso');
create type stato_visita as enum ('proposta', 'confermata', 'rifiutata', 'completata');
create type stato_verifica as enum ('non_avviata', 'in_verifica', 'verificato');
create type tipo_proprietario as enum ('privato', 'agenzia', 'property_manager');
create type nucleo_familiare as enum ('single', 'coppia');

-- ============================================================
-- PROFILES — una riga per utente Supabase Auth, ruolo fisso
-- (scelto una sola volta in onboarding, come nel prototipo)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ruolo ruolo_utente not null,
  nome text,
  cognome text,
  privacy_accettata boolean not null default false,
  consenso_marketing boolean not null default false,
  consenso_terzi boolean not null default false,
  onboarding_completato boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TENANT_PROFILES — dati "Il tuo profilo" + "La tua ricerca"
-- (1:1 con profiles dove ruolo = 'inquilino')
-- ============================================================

create table tenant_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,

  -- "I tuoi dati" (economico/personale — alimenta il voto di affidabilità)
  professione text,
  reddito_mensile integer,
  garante boolean,
  fideiussione boolean,
  protestato boolean,                 -- null = mai controllato
  animali boolean,
  nucleo nucleo_familiare,
  figli integer not null default 0,
  redditi_nucleo integer not null default 1,
  presentazione text,
  verificato boolean not null default false,
  verifica_stato stato_verifica not null default 'non_avviata',

  -- "La tua ricerca" (criteri di ricerca casa)
  budget_max integer,
  locali_min integer,
  mq_min integer,

  updated_at timestamptz not null default now()
);

-- Zone di interesse dell'inquilino (era profile.zone[] nel prototipo)
create table tenant_zone_interesse (
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  zona text not null,
  primary key (tenant_id, zona)
);

-- Interessi/caratteristiche pesate (era profile.interessi{chiave: 1-10})
create table tenant_interessi (
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  attributo_key text not null,
  peso smallint not null check (peso between 1 and 10),
  primary key (tenant_id, attributo_key)
);

-- ============================================================
-- OWNER_PROFILES — dati proprietario
-- (1:1 con profiles dove ruolo = 'proprietario')
-- ============================================================

create table owner_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  proprietario_tipo tipo_proprietario,
  num_immobili integer not null default 1,
  obiettivo text, -- 'Affittare velocemente' | 'Massima selezione' | 'Un equilibrio tra i due'
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RECENSIONI — storico affidabilità inquilino (era profile.reputazione)
-- Portabile, pubblica in lettura, scritta solo dal proprietario
-- di un contratto concluso con quell'inquilino.
-- ============================================================

create table recensioni (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  autore_id uuid not null references owner_profiles(profile_id),
  contratto_id uuid, -- FK aggiunta dopo (vedi ALTER sotto), per evitare ciclo di dipendenze
  voto smallint not null check (voto between 1 and 5),
  tag text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- LISTINGS — immobili pubblicati
-- ============================================================

create table listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owner_profiles(profile_id) on delete cascade,
  titolo text not null,
  descrizione text,
  zona text not null,
  indirizzo text,
  prezzo integer not null,
  locali smallint,
  mq smallint,
  attributi jsonb not null default '{}', -- caratteristiche (ascensore, balcone, ecc.)
  pubblicato boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  url text not null,
  ordine smallint not null default 0
);

create index idx_listings_owner on listings(owner_id);
create index idx_listings_zona on listings(zona);
create index idx_listings_pubblicato on listings(pubblicato);

-- ============================================================
-- CANDIDATURE — un inquilino si candida per un immobile
-- (era l'array `candidature` nel prototipo)
-- ============================================================

create table candidature (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  status stato_candidatura not null default 'in_attesa',
  match_pct smallint, -- percentuale di compatibilità calcolata al momento della candidatura
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, tenant_id) -- una sola candidatura per coppia listing/inquilino
);

create index idx_candidature_listing on candidature(listing_id);
create index idx_candidature_tenant on candidature(tenant_id);
create index idx_candidature_status on candidature(status);

-- ============================================================
-- CONTRATTI — 1:1 con una candidatura accettata
-- ============================================================

create table contratti (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null unique references candidature(id) on delete cascade,
  stato stato_contratto not null default 'bozza',
  canone integer,
  durata_mesi smallint,
  data_inizio date,
  data_firma date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ora che 'contratti' esiste, colleghiamo le recensioni al contratto concluso
alter table recensioni
  add constraint fk_recensioni_contratto
  foreign key (contratto_id) references contratti(id) on delete set null;

-- ============================================================
-- VISITE — fasce disponibili impostate dal proprietario +
-- prenotazione da parte dell'inquilino (gestite oggi in chat
-- nel prototipo, qui diventano una tabella vera)
-- ============================================================

create table visite (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  candidatura_id uuid references candidature(id) on delete set null,
  data_ora timestamptz not null,
  stato stato_visita not null default 'proposta',
  created_at timestamptz not null default now()
);

create index idx_visite_listing on visite(listing_id);
create index idx_visite_candidatura on visite(candidatura_id);

-- ============================================================
-- MESSAGGI — chat legata a una candidatura (owner <-> tenant)
-- ============================================================

create table messaggi (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references candidature(id) on delete cascade,
  mittente_id uuid not null references profiles(id),
  testo text not null,
  letto boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_messaggi_candidatura on messaggi(candidatura_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table tenant_profiles enable row level security;
alter table tenant_zone_interesse enable row level security;
alter table tenant_interessi enable row level security;
alter table owner_profiles enable row level security;
alter table recensioni enable row level security;
alter table listings enable row level security;
alter table listing_photos enable row level security;
alter table candidature enable row level security;
alter table contratti enable row level security;
alter table visite enable row level security;
alter table messaggi enable row level security;

-- ---- profiles: ognuno vede/modifica solo il proprio ----
create policy "profiles: select own" on profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on profiles
  for update using (auth.uid() = id);
create policy "profiles: insert own" on profiles
  for insert with check (auth.uid() = id);

-- ---- tenant_profiles: il tenant vede/modifica il proprio; ----
-- ---- un proprietario può leggere il profilo di chi si è candidato a un suo annuncio ----
create policy "tenant_profiles: self" on tenant_profiles
  for all using (auth.uid() = profile_id);

create policy "tenant_profiles: owner reads applicants" on tenant_profiles
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.tenant_id = tenant_profiles.profile_id
        and l.owner_id = auth.uid()
    )
  );

create policy "tenant_zone: self" on tenant_zone_interesse
  for all using (auth.uid() = tenant_id);

create policy "tenant_interessi: self" on tenant_interessi
  for all using (auth.uid() = tenant_id);

-- ---- owner_profiles: il proprietario vede/modifica il proprio; ----
-- ---- gli inquilini con una candidatura attiva possono leggerlo (per la chat/contatti) ----
create policy "owner_profiles: self" on owner_profiles
  for all using (auth.uid() = profile_id);

create policy "owner_profiles: applicant reads" on owner_profiles
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where l.owner_id = owner_profiles.profile_id
        and c.tenant_id = auth.uid()
    )
  );

-- ---- recensioni: lettura pubblica (l'affidabilità deve essere visibile), ----
-- ---- scrittura solo dal proprietario titolare del contratto concluso ----
create policy "recensioni: read all" on recensioni
  for select using (true);

create policy "recensioni: owner writes" on recensioni
  for insert with check (
    auth.uid() = autore_id
    and exists (
      select 1 from contratti ct
      join candidature c on c.id = ct.candidatura_id
      join listings l on l.id = c.listing_id
      where ct.id = recensioni.contratto_id
        and ct.stato = 'concluso'
        and l.owner_id = auth.uid()
    )
  );

-- ---- listings: pubblicati visibili a tutti; il proprietario gestisce i propri ----
create policy "listings: read published" on listings
  for select using (pubblicato = true or owner_id = auth.uid());

create policy "listings: owner writes" on listings
  for insert with check (auth.uid() = owner_id);
create policy "listings: owner updates" on listings
  for update using (auth.uid() = owner_id);
create policy "listings: owner deletes" on listings
  for delete using (auth.uid() = owner_id);

create policy "listing_photos: read with listing" on listing_photos
  for select using (
    exists (
      select 1 from listings l
      where l.id = listing_photos.listing_id
        and (l.pubblicato = true or l.owner_id = auth.uid())
    )
  );
create policy "listing_photos: owner writes" on listing_photos
  for all using (
    exists (select 1 from listings l where l.id = listing_photos.listing_id and l.owner_id = auth.uid())
  );

-- ---- candidature: visibili al tenant che si è candidato e al proprietario dell'annuncio ----
create policy "candidature: tenant reads own" on candidature
  for select using (auth.uid() = tenant_id);
create policy "candidature: owner reads received" on candidature
  for select using (
    exists (select 1 from listings l where l.id = candidature.listing_id and l.owner_id = auth.uid())
  );
create policy "candidature: tenant creates" on candidature
  for insert with check (auth.uid() = tenant_id);
create policy "candidature: owner updates status" on candidature
  for update using (
    exists (select 1 from listings l where l.id = candidature.listing_id and l.owner_id = auth.uid())
  );

-- ---- contratti: visibili a entrambe le parti della candidatura ----
create policy "contratti: parties read" on contratti
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = contratti.candidatura_id
        and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
    )
  );
create policy "contratti: owner writes" on contratti
  for all using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = contratti.candidatura_id and l.owner_id = auth.uid()
    )
  );

-- ---- visite: visibili a entrambe le parti dell'immobile/candidatura ----
create policy "visite: parties read" on visite
  for select using (
    exists (
      select 1 from listings l
      where l.id = visite.listing_id
        and (l.owner_id = auth.uid()
             or exists (select 1 from candidature c where c.id = visite.candidatura_id and c.tenant_id = auth.uid()))
    )
  );
create policy "visite: owner manages slots" on visite
  for all using (
    exists (select 1 from listings l where l.id = visite.listing_id and l.owner_id = auth.uid())
  );
create policy "visite: tenant books" on visite
  for update using (
    exists (select 1 from candidature c where c.id = visite.candidatura_id and c.tenant_id = auth.uid())
  );

-- ---- messaggi: visibili/scrivibili solo dalle due parti della candidatura ----
create policy "messaggi: parties read" on messaggi
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = messaggi.candidatura_id
        and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
    )
  );
create policy "messaggi: parties write" on messaggi
  for insert with check (
    auth.uid() = mittente_id
    and exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = messaggi.candidatura_id
        and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
    )
  );
