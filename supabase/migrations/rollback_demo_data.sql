-- ============================================================
-- MatchAmI — rollback di seed_demo_data.sql
--
-- Cancella i 4 annunci di prova, le 3 candidature, il contratto,
-- i 2 messaggi di chat e la recensione storica.
--
-- COME FUNZIONA
-- Lo schema ha ON DELETE CASCADE lungo tutta la catena:
--   listings → candidature → contratti / messaggi / visite
-- quindi cancellare gli annunci porta via candidature, contratto e
-- messaggi da solo.
--
-- La recensione è il caso a parte: `recensioni` non è collegata ai
-- listing (dipende da tenant_profiles), quindi va cancellata a mano,
-- PRIMA degli annunci.
--
-- COME RICONOSCO LA RECENSIONE DI PROVA
-- Il seed la inserisce senza `contratto_id`. La policy RLS di scrittura
-- dell'app, invece, esige un contratto in stato 'concluso', quindi una
-- recensione con `contratto_id is null` può essere arrivata solo dal
-- seed. Uso quello come discriminante, insieme a voto e tag.
--
-- Esegui in Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 1 — Prova a vuoto: guarda COSA verrà cancellato.
-- ------------------------------------------------------------

-- 1a. Gli annunci (e cosa si portano dietro)
select
  l.id,
  l.titolo,
  l.zona,
  (select count(*) from candidature c where c.listing_id = l.id) as candidature,
  (select count(*) from contratti ct
     join candidature c on c.id = ct.candidatura_id
    where c.listing_id = l.id)                                   as contratti,
  (select count(*) from messaggi m
     join candidature c on c.id = m.candidatura_id
    where c.listing_id = l.id)                                   as messaggi
from listings l
where l.titolo in (
  'Loft Ticinese',
  'Bilocale NoLo',
  'Trilocale Porta Nuova',
  'Monolocale Loreto'
)
order by l.created_at desc;

-- 1b. La recensione di prova
select id, tenant_id, autore_id, voto, tag, contratto_id, created_at
from recensioni
where contratto_id is null
  and voto = 5
  and tag @> ARRAY['Puntuale nei pagamenti', 'Casa lasciata in ottimo stato'];


-- ------------------------------------------------------------
-- PASSO 2 — Cancellazione vera e propria.
-- L'ordine conta: prima la recensione, poi gli annunci.
-- ------------------------------------------------------------

begin;

-- 2a. Recensione storica (non cancellata dalla cascata dei listing)
delete from recensioni
where contratto_id is null
  and voto = 5
  and tag @> ARRAY['Puntuale nei pagamenti', 'Casa lasciata in ottimo stato'];

-- 2b. Annunci → si portano via candidature, contratto, messaggi, visite
delete from listings
where titolo in (
  'Loft Ticinese',
  'Bilocale NoLo',
  'Trilocale Porta Nuova',
  'Monolocale Loreto'
);

-- Controllo prima di confermare
select 'listings'   as tabella, count(*) from listings
union all select 'candidature', count(*) from candidature
union all select 'contratti',   count(*) from contratti
union all select 'messaggi',    count(*) from messaggi
union all select 'recensioni',  count(*) from recensioni;

commit;
-- rollback;   -- <- scommenta questa e commenta `commit;` per annullare


-- ------------------------------------------------------------
-- PASSO 3 — Verifica finale: entrambe le colonne devono dare 0.
-- ------------------------------------------------------------

select
  (select count(*) from listings
    where titolo in ('Loft Ticinese', 'Bilocale NoLo',
                     'Trilocale Porta Nuova', 'Monolocale Loreto')) as annunci_demo_rimasti,
  (select count(*) from recensioni
    where contratto_id is null
      and voto = 5
      and tag @> ARRAY['Puntuale nei pagamenti',
                       'Casa lasciata in ottimo stato'])            as recensioni_demo_rimaste;
