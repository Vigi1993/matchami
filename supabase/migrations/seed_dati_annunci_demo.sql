-- ============================================================
-- MatchAmI — SOLO PER PROVA: compila i dati nuovi degli annunci già presenti
--
-- NON è una migrazione: non metterla in supabase/migrations e non lanciarla in produzione.
-- Serve a chi sta provando l'app con annunci di demo, per vedere i filtri nuovi (bagni, piano, riscaldamento, tipo
-- di contratto, disponibilità) senza inserirli a mano uno per uno.
--
-- Riempie SOLO i campi ancora vuoti, con valori «casuali ma sempre gli stessi» ricavati dall'identificativo
-- dell'annuncio. Non tocca la classe energetica né la verifica. Lanciala dopo la 0030 e la 0031.
-- ============================================================

update listings
   set bagni           = coalesce(bagni, 1 + (abs(hashtext(id::text)) % 3)),
       piano           = coalesce(piano, abs(hashtext(id::text || 'p')) % 6),
       riscaldamento   = coalesce(riscaldamento, (array['autonomo','centralizzato','teleriscaldamento','pompa_di_calore'])[1 + abs(hashtext(id::text || 'r')) % 4]),
       tipo_contratto  = coalesce(tipo_contratto, (array['libero_4_4','concordato_3_2','transitorio','studenti'])[1 + abs(hashtext(id::text || 'c')) % 4]),
       disponibile_dal = coalesce(disponibile_dal, current_date + (abs(hashtext(id::text || 'd')) % 60))
 where bagni is null or piano is null or riscaldamento is null or tipo_contratto is null or disponibile_dal is null;

-- quanti annunci restano senza luogo (la zona scritta non corrisponde a nessun quartiere dell'elenco)
select count(*) filter (where luogo_id is null) as annunci_senza_luogo, count(*) as annunci from listings;
