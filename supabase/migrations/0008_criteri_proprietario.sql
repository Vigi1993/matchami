-- ============================================================
-- MatchAmI — criteri del proprietario e match lato proprietario
--
-- Aggiunge:
--   1. `tenant_profiles.reddito_nucleo`: il reddito mensile di TUTTO il
--      nucleo, chiesto esplicitamente (decisione D6). Il campo
--      `reddito_mensile` esistente resta com'è: nessun dato vecchio viene
--      reinterpretato.
--   2. `listing_criteri`: cosa chiede il proprietario per ogni annuncio,
--      con peso 1-10 e modo obbligatorio/preferenziale.
--   3. due colonne su `candidature` per la fotografia del match lato
--      proprietario, scattata quando il proprietario decide (D7).
--   4. una policy più stretta per la creazione delle candidature.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Reddito del nucleo
-- ------------------------------------------------------------

alter table tenant_profiles
  add column if not exists reddito_nucleo integer
  check (reddito_nucleo is null or reddito_nucleo >= 0);

-- ------------------------------------------------------------
-- 2. Criteri richiesti dal proprietario, uno per riga
--
-- Visibili e modificabili SOLO dal proprietario dell'annuncio: gli
-- inquilini non li leggono (nessuna policy per loro = nessun accesso).
-- ------------------------------------------------------------

create table if not exists listing_criteri (
  listing_id uuid not null references listings(id) on delete cascade,
  chiave text not null,
  peso smallint not null check (peso between 1 and 10),
  modo text not null check (modo in ('obbligatorio', 'preferenziale')),
  -- solo per il criterio sul reddito: il canone non supera questa % del
  -- reddito. I limiti precisi sono nell'app (config.ts); qui solo la
  -- sanità di base.
  soglia_pct smallint check (soglia_pct is null or soglia_pct between 1 and 100),
  primary key (listing_id, chiave)
);

alter table listing_criteri enable row level security;

create policy "listing_criteri: il proprietario gestisce i suoi" on listing_criteri
  for all
  using (
    exists (
      select 1 from listings l
      where l.id = listing_criteri.listing_id and l.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from listings l
      where l.id = listing_criteri.listing_id and l.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3. Fotografia del match lato proprietario
--
-- Finché la candidatura è in attesa il match si ricalcola sui dati
-- attuali dell'inquilino. Quando il proprietario accetta o rifiuta, il
-- risultato si fissa qui: un inquilino non può più cambiare un reddito
-- dopo essere stato accettato (D7).
-- ------------------------------------------------------------

alter table candidature
  add column if not exists match_proprietario jsonb,
  add column if not exists match_proprietario_at timestamptz;

-- ------------------------------------------------------------
-- 4. Chi crea una candidatura non può decidere il proprio esito
--
-- La policy precedente controllava solo che `tenant_id` fosse quello
-- dell'utente: un inquilino che chiamava direttamente l'API poteva
-- inserire una candidatura già `accettata`, saltando la decisione del
-- proprietario, o con una fotografia del match scelta da lui.
-- ------------------------------------------------------------

drop policy if exists "candidature: tenant creates" on candidature;

create policy "candidature: tenant creates" on candidature
  for insert
  with check (
    auth.uid() = tenant_id
    and status = 'in_attesa'
    and match_proprietario is null
    and match_proprietario_at is null
  );

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select column_name, data_type from information_schema.columns
where table_name = 'tenant_profiles' and column_name = 'reddito_nucleo';

select table_name from information_schema.tables where table_name = 'listing_criteri';

select column_name from information_schema.columns
where table_name = 'candidature' and column_name like 'match_proprietario%';

select polname from pg_policy
where polrelid = 'candidature'::regclass and polname = 'candidature: tenant creates';
