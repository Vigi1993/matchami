-- ============================================================
-- Si tolgono dal profilo del proprietario i tre dati che non servivano a niente: tipo di proprietario, numero di immobili, obiettivo.
--
-- Li scriveva soltanto il modulo «I tuoi dati» del Profilo, e nessuna parte dell'app li leggeva mai (non influivano sulle candidature, non li vedeva
-- nessuno). Il modulo non c'è più e l'informativa non li elenca più: tenerli nel database sarebbe conservare dati personali senza uno scopo.
--
-- ATTENZIONE: è IRREVERSIBILE. I valori già salvati si perdono. Se un giorno servissero di nuovo, si rimettono le colonne (vuote).
-- Rieseguirla non dà errori (se le colonne non ci sono più non fa niente).
--
-- Resta la tabella owner_profiles con l'identificativo della persona (collegato al suo profilo) e la data di aggiornamento: è ciò che serve perché
-- una persona risulti proprietario (gli immobili, le candidature e il resto si agganciano lì).
-- ============================================================

alter table owner_profiles
  drop column if exists proprietario_tipo,
  drop column if exists num_immobili,
  drop column if exists obiettivo;

-- Il tipo («privato», «agenzia», «property_manager») serviva solo a quella colonna.
drop type if exists tipo_proprietario;
