-- ============================================================
-- MatchAmI — dati di prova per popolare la Home (5 annunci)
--
-- PRIMA di eseguire questo script: assicurati di avere almeno un
-- account "proprietario" nel tuo Supabase. Se non ce l'hai, vai su
-- /login, tab "Registrati", scegli "Ho un immobile" con un'email
-- diversa da quella che usi come inquilino, e completa la registrazione
-- (con conferma email). Poi torna qui ed esegui questo script in
-- SQL Editor su Supabase.
-- ============================================================

insert into listings (owner_id, titolo, descrizione, zona, prezzo, locali, mq, pubblicato)
select
  (select profile_id from owner_profiles limit 1),
  v.titolo, v.descrizione, v.zona, v.prezzo, v.locali, v.mq, true
from (values
  ('Bilocale luminoso ai Navigli', 'Bilocale ristrutturato, vicino ai locali dei Navigli.', 'Navigli, Milano', 1200, 2, 50),
  ('Trilocale con balcone a Isola', 'Trilocale silenzioso, palazzo con ascensore.', 'Isola, Milano', 1550, 3, 68),
  ('Monolocale Città Studi', 'Ideale per studenti, vicino al Politecnico.', 'Città Studi, Milano', 850, 1, 32),
  ('Bilocale Porta Romana', 'Bilocale arredato, zona ben servita.', 'Porta Romana, Milano', 1300, 2, 55),
  ('Quadrilocale Bicocca', 'Ampio quadrilocale, ottimo per famiglie.', 'Bicocca, Milano', 1800, 4, 95)
) as v(titolo, descrizione, zona, prezzo, locali, mq);

-- Verifica: dovresti vedere i 5 annunci appena creati
select id, titolo, zona, prezzo, locali, mq from listings order by created_at desc limit 10;
