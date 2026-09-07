-- ============================================================
-- MatchAmI — rollback di seed_demo_listings.sql
--
-- Cancella i 5 annunci di prova creati per popolare la Home.
--
-- Grazie ai vincoli ON DELETE CASCADE dello schema, cancellare una
-- riga di `listings` porta via da sola anche:
--   listing_photos → candidature → contratti / messaggi / visite
-- Non serve quindi cancellarli a mano.
--
-- ATTENZIONE: se nel frattempo qualcuno si è candidato davvero su uno
-- di questi annunci, anche quella candidatura (con chat e contratto)
-- sparisce. È il comportamento voluto quando si ripulisce la demo, ma
-- meglio saperlo prima di eseguire.
--
-- Esegui in Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 1 — Prova a vuoto: guarda COSA verrà cancellato.
-- Esegui solo questa parte, controlla il risultato, e passa al 2.
-- ------------------------------------------------------------

select
  l.id,
  l.titolo,
  l.zona,
  l.prezzo,
  l.created_at,
  (select count(*) from candidature c where c.listing_id = l.id)   as candidature_collegate,
  (select count(*) from listing_photos p where p.listing_id = l.id) as foto_collegate
from listings l
where l.titolo in (
  'Bilocale luminoso ai Navigli',
  'Trilocale con balcone a Isola',
  'Monolocale Città Studi',
  'Bilocale Porta Romana',
  'Quadrilocale Bicocca'
)
order by l.created_at desc;

-- Se la colonna `candidature_collegate` è > 0 su qualche riga, quelle
-- candidature verranno cancellate a cascata insieme all'annuncio.


-- ------------------------------------------------------------
-- PASSO 2 — Cancellazione vera e propria.
-- ------------------------------------------------------------

begin;

delete from listings
where titolo in (
  'Bilocale luminoso ai Navigli',
  'Trilocale con balcone a Isola',
  'Monolocale Città Studi',
  'Bilocale Porta Romana',
  'Quadrilocale Bicocca'
);

-- Guarda quante righe restano. Se il numero non ti convince, dai
-- `rollback;` invece di `commit;` e non viene cancellato niente.
select 'listings'      as tabella, count(*) from listings
union all select 'listing_photos', count(*) from listing_photos
union all select 'candidature',    count(*) from candidature
union all select 'contratti',      count(*) from contratti
union all select 'messaggi',       count(*) from messaggi;

commit;
-- rollback;   -- <- scommenta questa e commenta `commit;` per annullare


-- ------------------------------------------------------------
-- PASSO 3 — Verifica finale: deve restituire 0 righe.
-- ------------------------------------------------------------

select count(*) as annunci_demo_rimasti
from listings
where titolo in (
  'Bilocale luminoso ai Navigli',
  'Trilocale con balcone a Isola',
  'Monolocale Città Studi',
  'Bilocale Porta Romana',
  'Quadrilocale Bicocca'
);
