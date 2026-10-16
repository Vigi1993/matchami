-- ============================================================
-- MatchAmI — foto di prova per gli annunci demo
--
-- PREREQUISITO: aver caricato le 27 immagini nel bucket Storage
-- "immobili-foto", dentro una cartella chiamata "demo".
-- Istruzioni passo passo nel README allegato.
--
-- PRIMA DI ESEGUIRE: sostituisci XXXXXXXXXXXX qui sotto con il
-- reference del tuo progetto Supabase. Lo trovi nell'URL della
-- dashboard (https://supabase.com/dashboard/project/XXXXXXXXXXXX)
-- oppure in Settings → API → Project URL.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 1 — Inserimento
-- ------------------------------------------------------------

begin;

with base as (
  select 'https://XXXXXXXXXXXX.supabase.co/storage/v1/object/public/immobili-foto/demo/' as prefisso
),
foto (titolo, file, ordine) as (values
  ('Monolocale Loreto', 'monolocale-loreto-1.jpg', 0),
  ('Monolocale Loreto', 'monolocale-loreto-2.jpg', 1),
  ('Monolocale Loreto', 'monolocale-loreto-3.jpg', 2),
  ('Monolocale Città Studi', 'monolocale-citta-studi-1.jpg', 0),
  ('Monolocale Città Studi', 'monolocale-citta-studi-2.jpg', 1),
  ('Monolocale Città Studi', 'monolocale-citta-studi-3.jpg', 2),
  ('Bilocale NoLo', 'bilocale-nolo-1.jpg', 0),
  ('Bilocale NoLo', 'bilocale-nolo-2.jpg', 1),
  ('Bilocale NoLo', 'bilocale-nolo-3.jpg', 2),
  ('Bilocale luminoso ai Navigli', 'bilocale-navigli-1.jpg', 0),
  ('Bilocale luminoso ai Navigli', 'bilocale-navigli-2.jpg', 1),
  ('Bilocale luminoso ai Navigli', 'bilocale-navigli-3.jpg', 2),
  ('Bilocale Porta Romana', 'bilocale-porta-romana-1.jpg', 0),
  ('Bilocale Porta Romana', 'bilocale-porta-romana-2.jpg', 1),
  ('Bilocale Porta Romana', 'bilocale-porta-romana-3.jpg', 2),
  ('Loft Ticinese', 'loft-ticinese-1.jpg', 0),
  ('Loft Ticinese', 'loft-ticinese-2.jpg', 1),
  ('Loft Ticinese', 'loft-ticinese-3.jpg', 2),
  ('Trilocale con balcone a Isola', 'trilocale-isola-1.jpg', 0),
  ('Trilocale con balcone a Isola', 'trilocale-isola-2.jpg', 1),
  ('Trilocale con balcone a Isola', 'trilocale-isola-3.jpg', 2),
  ('Trilocale Porta Nuova', 'trilocale-porta-nuova-1.jpg', 0),
  ('Trilocale Porta Nuova', 'trilocale-porta-nuova-2.jpg', 1),
  ('Trilocale Porta Nuova', 'trilocale-porta-nuova-3.jpg', 2),
  ('Quadrilocale Bicocca', 'quadrilocale-bicocca-1.jpg', 0),
  ('Quadrilocale Bicocca', 'quadrilocale-bicocca-2.jpg', 1),
  ('Quadrilocale Bicocca', 'quadrilocale-bicocca-3.jpg', 2)
)
insert into listing_photos (listing_id, url, ordine)
select l.id, base.prefisso || foto.file, foto.ordine
from foto
join listings l on l.titolo = foto.titolo
cross join base;

-- Controllo: ogni annuncio demo deve avere 3 foto
select l.titolo, count(p.id) as foto
from listings l
left join listing_photos p on p.listing_id = l.id
where l.titolo in (
  'Bilocale luminoso ai Navigli', 'Trilocale con balcone a Isola',
  'Monolocale Città Studi', 'Bilocale Porta Romana', 'Quadrilocale Bicocca',
  'Loft Ticinese', 'Bilocale NoLo', 'Trilocale Porta Nuova', 'Monolocale Loreto'
)
group by l.titolo
order by l.titolo;

commit;
-- rollback;   -- <- scommenta questa e commenta `commit;` per annullare


-- ------------------------------------------------------------
-- PASSO 2 — Verifica che un URL risponda davvero
-- Copia un valore della colonna `url` e aprilo nel browser:
-- se vedi la foto, il collegamento con lo Storage funziona.
-- ------------------------------------------------------------

select l.titolo, p.ordine, p.url
from listing_photos p
join listings l on l.id = p.listing_id
order by l.titolo, p.ordine
limit 5;


-- ============================================================
-- ROLLBACK — toglie SOLO queste foto, lascia gli annunci
-- ============================================================
-- delete from listing_photos
-- where url like '%/immobili-foto/demo/%';
