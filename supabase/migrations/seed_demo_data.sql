-- ============================================================
-- MatchAmI — dati di prova completi
--
-- Usa il primo proprietario e il primo inquilino che trova già
-- registrati nel tuo Supabase (l'ordine non conta, basta che esista
-- almeno un account per ruolo). Popola:
--   - 4 nuovi annunci
--   - 3 candidature con stati diversi (in attesa / match / scartata)
--   - 1 contratto (in firma) per la candidatura accettata
--   - 2 messaggi di chat su quella candidatura
--   - 1 recensione storica (per vedere il voto di affidabilità cambiare)
--
-- Se vuoi testare con PIÙ inquilini diversi, registra 2-3 account in
-- più scegliendo "Cerco casa" prima di rieseguire lo script (puoi anche
-- copiare le singole insert e cambiare la sotto-query "limit 1 offset N").
-- Eseguibile una sola volta: rilanciarlo crea duplicati (nessun controllo
-- di idempotenza, è pensato per un ambiente di test).
-- ============================================================

-- 1. Nuovi annunci per il proprietario di prova
insert into listings (owner_id, titolo, descrizione, zona, prezzo, locali, mq, pubblicato)
select (select profile_id from owner_profiles order by profile_id limit 1),
       v.titolo, v.descrizione, v.zona, v.prezzo, v.locali, v.mq, true
from (values
  ('Loft Ticinese', 'Loft open space con soppalco, zona vivace.', 'Ticinese, Milano', 1600, 2, 60),
  ('Bilocale NoLo', 'Bilocale ristrutturato, quartiere in crescita.', 'NoLo, Milano', 1050, 2, 48),
  ('Trilocale Porta Nuova', 'Trilocale moderno, palazzo con portineria.', 'Porta Nuova, Milano', 2000, 3, 75),
  ('Monolocale Loreto', 'Monolocale efficiente, ben collegato.', 'Loreto, Milano', 780, 1, 28)
) as v(titolo, descrizione, zona, prezzo, locali, mq);

-- 2. Candidature del primo inquilino di prova, con stati diversi
insert into candidature (listing_id, tenant_id, status, match_pct)
select id, (select profile_id from tenant_profiles order by profile_id limit 1), 'in_attesa', 72
from listings where titolo = 'Bilocale NoLo';

insert into candidature (listing_id, tenant_id, status, match_pct)
select id, (select profile_id from tenant_profiles order by profile_id limit 1), 'accettata', 91
from listings where titolo = 'Loft Ticinese';

insert into candidature (listing_id, tenant_id, status, match_pct)
select id, (select profile_id from tenant_profiles order by profile_id limit 1), 'rifiutata', 55
from listings where titolo = 'Trilocale Porta Nuova';

-- 3. Contratto (in firma) per la candidatura accettata sul Loft Ticinese
insert into contratti (candidatura_id, stato, canone, durata_mesi, data_inizio)
select c.id, 'in_firma', 1600, 24, current_date + interval '30 days'
from candidature c
join listings l on l.id = c.listing_id
where l.titolo = 'Loft Ticinese' and c.status = 'accettata';

-- 4. Un paio di messaggi nella chat di quella candidatura
insert into messaggi (candidatura_id, mittente_id, testo)
select c.id, (select profile_id from tenant_profiles order by profile_id limit 1),
       'Ciao! Sarei molto interessata, quando possiamo vederci?'
from candidature c join listings l on l.id = c.listing_id
where l.titolo = 'Loft Ticinese' and c.status = 'accettata';

insert into messaggi (candidatura_id, mittente_id, testo)
select c.id, (select profile_id from owner_profiles order by profile_id limit 1),
       'Ciao! Ti va bene sabato mattina?'
from candidature c join listings l on l.id = c.listing_id
where l.titolo = 'Loft Ticinese' and c.status = 'accettata';

-- 5. Una recensione "storica" per l'inquilino (voto di affidabilità)
insert into recensioni (tenant_id, autore_id, voto, tag)
select (select profile_id from tenant_profiles order by profile_id limit 1),
       (select profile_id from owner_profiles order by profile_id limit 1),
       5, ARRAY['Puntuale nei pagamenti', 'Casa lasciata in ottimo stato'];

-- Verifica finale
select 'listings' as tabella, count(*) from listings
union all select 'candidature', count(*) from candidature
union all select 'contratti', count(*) from contratti
union all select 'messaggi', count(*) from messaggi
union all select 'recensioni', count(*) from recensioni;
