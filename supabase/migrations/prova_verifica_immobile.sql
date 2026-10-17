-- ============================================================
-- MatchAmI — SOLO PER PROVA: «verifica» un immobile senza passare dallo staff.
--
-- NON è una migrazione: non metterla in supabase/migrations e non lanciarla in produzione.
--
-- Da quando esiste la migrazione 0037, una casa si può verificare solo se ha una prova di proprietà caricata: la scorciatoia
-- «metto verificato a mano» non funziona più (ed è giusto: una casa verificata senza documenti era un controsenso).
-- Per provare l'app in fretta, questo file fa le due cose nell'ordine giusto: registra un documento FINTO per la casa e poi la mette «verificata».
--
-- ATTENZIONE: il documento è finto, non esiste nell'archivio dei file. Nella scheda della casa compare nell'elenco, ma «Apri» e «Scarica»
-- daranno «Non riesco ad aprire il documento». Per avere un documento vero, caricalo dalla scheda della casa e fai verificare dallo staff.
--
-- COME SI USA: cambia il nome qui sotto (deve essere IDENTICO al titolo della casa) e lancialo nell'editor SQL.
-- ============================================================

with scelta as (select 'Bilocale luminoso'::text as titolo),   -- <<< CAMBIA QUESTO NOME
case_scelte as (
  select l.id, l.owner_id from listings l, scelta s where l.titolo = s.titolo
),
prove as (
  insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file)
  select c.owner_id, c.id, 'proprieta', c.owner_id::text || '/proprieta-prova-' || c.id::text || '.pdf', 'visura-di-prova.pdf'
    from case_scelte c
   where not exists (select 1 from documenti_verifica d where d.listing_id = c.id and d.tipo = 'proprieta')
  returning listing_id
)
select (select count(*) from case_scelte) as case_trovate, (select count(*) from prove) as documenti_finti_creati;

-- la verifica viene DOPO la prova (il database lo pretende)
update listings
   set verifica_stato = 'verificato',
       verificato_at = now(),
       verifica_esito_note = null
 where titolo = 'Bilocale luminoso'          -- <<< CAMBIA ANCHE QUESTO (lo stesso nome)
   and verifica_stato <> 'verificato';

select id, titolo, verifica_stato from listings where titolo = 'Bilocale luminoso';   -- <<< e questo
