-- Dopo la 0037: le case verificate senza prova sono tornate «da verificare»; le altre non sono cambiate; da ora nessuno può verificare una casa senza prova.
\set ON_ERROR_STOP on
\set QUIET on
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'CONTROLLO FALLITO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
create function t.fallisce(sql text, codice text, msg text) returns void language plpgsql as $$
declare e text;
begin
  begin execute sql; exception when others then e := sqlerrm; end;
  if e is null then raise exception 'CONTROLLO FALLITO (nessun errore): %', msg; end if;
  if position(codice in e) = 0 then raise exception 'CONTROLLO FALLITO (errore diverso: %): %', e, msg; end if;
  raise notice 'OK: %', msg;
end $$;
create function t.come(utente uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(utente::text, ''), false);
  if utente is null then set role anon; else set role authenticated; end if;
end $$;
create function t.torna() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

-- ---- il riallineamento ----
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000a') = 'non_avviata' and (select verificato_at from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000a') is null, 'V1 la casa verificata a mano SENZA nessuna prova è tornata «da verificare», senza data di verifica');
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000e') = 'non_avviata', 'V2 anche quella che aveva solo l''identità e la prova di un''ALTRA casa (la prova deve essere della casa stessa)');
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'verificato' and (select verificato_at from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = '2026-09-02T10:00:00Z', 'V3 la casa verificata CON la sua prova non cambia, nemmeno la data di verifica');
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000c') = 'non_avviata' and (select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000d') = 'in_verifica', 'V4 le case da verificare e in verifica non cambiano');
select t.ok((select count(*) from documenti_verifica) = 3, 'V5 nessun documento è stato toccato');

-- ---- da ora in poi ----
select t.fallisce($q$insert into listings (id, owner_id, titolo, zona, prezzo, verifica_stato) values ('bbbbbbbb-0000-0000-0000-0000000000f0', '66666666-0000-0000-0000-00000000000a', 'Nasce già verificata', 'Isola', 900, 'verificato')$q$, 'PROVA_PROPRIETA_MANCANTE', 'V6 una casa non può NASCERE già verificata (la prova può essere registrata solo dopo che la casa esiste)');
select t.fallisce($q$update listings set verifica_stato = 'verificato' where id = 'bbbbbbbb-0000-0000-0000-00000000000c'$q$, 'PROVA_PROPRIETA_MANCANTE', 'V7 non si verifica una casa senza prova, nemmeno dal pannello SQL');
select t.fallisce($q$update listings set verifica_stato = 'verificato' where id = 'bbbbbbbb-0000-0000-0000-00000000000e'$q$, 'PROVA_PROPRIETA_MANCANTE', 'V8 né una casa che ha solo l''identità e la prova di un''altra casa');
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000c') = 'non_avviata', 'V9 e la casa resta com''era');
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values ('66666666-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000c', 'proprieta', '66666666-0000-0000-0000-00000000000a/proprieta-c.pdf', 'visura-c.pdf');
update listings set verifica_stato = 'verificato', verificato_at = now() where id = 'bbbbbbbb-0000-0000-0000-00000000000c';
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000c') = 'verificato', 'V10 con la prova della casa caricata, la verifica è possibile');
update listings set titolo = 'B con prova (rinominata)' where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select t.ok((select titolo from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000b') like 'B con prova (rin%', 'V11 una casa già verificata si modifica come prima');
-- un caso vecchio: casa già verificata a cui (solo da SQL) si toglie la prova; riscrivere lo STESSO stato non deve dare errore (non si ricontrolla ciò che era già verificato)
delete from documenti_verifica where listing_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
update listings set verifica_stato = 'verificato' where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'verificato', 'V12 una casa GIÀ verificata non si ricontrolla se si riscrive lo stesso stato (il controllo scatta solo quando si diventa verificati)');
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values ('66666666-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b', 'proprieta', '66666666-0000-0000-0000-00000000000a/proprieta-b2.pdf', 'visura-b2.pdf');

-- ---- lo staff ----
-- la casa D aveva una prova: la tolgo (solo da SQL: l'app non lo permette) per provare lo staff
delete from documenti_verifica where listing_id = 'bbbbbbbb-0000-0000-0000-00000000000d';
select t.come('66666666-0000-0000-0000-0000000000f1');
select t.fallisce($q$select esito_verifica_immobile('bbbbbbbb-0000-0000-0000-00000000000d', true, null)$q$, 'PROVA_PROPRIETA_MANCANTE', 'V13 nemmeno lo staff può verificare una casa in verifica che non ha nessuna prova');
select t.torna();
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000d') = 'in_verifica', 'V14 e la casa resta in verifica');
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values ('66666666-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000d', 'proprieta', '66666666-0000-0000-0000-00000000000b/proprieta-d2.pdf', 'visura-d2.pdf');
select t.come('66666666-0000-0000-0000-0000000000f1');
select esito_verifica_immobile('bbbbbbbb-0000-0000-0000-00000000000d', true, null);
select t.torna();
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-00000000000d') = 'verificato', 'V15 con la prova caricata lo staff può verificare');
-- la regola riguarda solo il DIVENTARE verificata: tutto il resto funziona come prima
insert into listings (id, owner_id, titolo, zona, prezzo) values ('bbbbbbbb-0000-0000-0000-0000000000f2', '66666666-0000-0000-0000-00000000000a', 'Nuova da verificare', 'Isola', 800);
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-0000000000f2') = 'non_avviata', 'V17 una casa nuova nasce «da verificare» senza nessun ostacolo');
update listings set verifica_stato = 'in_verifica' where id = 'bbbbbbbb-0000-0000-0000-0000000000f2';
update listings set verifica_stato = 'non_avviata' where id = 'bbbbbbbb-0000-0000-0000-0000000000f2';
select t.ok((select verifica_stato::text from listings where id = 'bbbbbbbb-0000-0000-0000-0000000000f2') = 'non_avviata', 'V18 e può andare «in verifica» e tornare «da verificare» (come quando lo staff respinge)');
select t.ok((select count(*) from pg_trigger where tgname = 'garantisci_prova_proprieta' and tgrelid = 'listings'::regclass) = 1, 'V16 la regola è un trigger sulla tabella delle case, uno solo');
