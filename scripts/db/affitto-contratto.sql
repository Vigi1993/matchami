-- ============================================================
-- Prova della migrazione 0035 (affitto verificabile da contratto) su un PostgreSQL vero.
-- Database con lo stub di Supabase e TUTTE le migrazioni già applicate. Ogni controllo scrive «OK: ...» o ferma tutto.
-- ============================================================
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create schema t;
create table t.esiti (n serial, testo text);
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'CONTROLLO FALLITO: %', msg; end if;
  insert into t.esiti (testo) values (msg);
  raise notice 'OK: %', msg;
end $$;
create function t.fallisce(sql text, codice text, msg text) returns void language plpgsql as $$
declare e text;
begin
  begin execute sql; exception when others then e := sqlerrm; end;
  if e is null then raise exception 'CONTROLLO FALLITO (nessun errore): %', msg; end if;
  if position(codice in e) = 0 then raise exception 'CONTROLLO FALLITO (errore diverso: %): %', e, msg; end if;
  insert into t.esiti (testo) values (msg);
  raise notice 'OK: %', msg;
end $$;
create function t.righe(sql text) returns int language plpgsql as $$
declare n int;
begin execute sql; get diagnostics n = row_count; return n; end $$;
create function t.come(utente uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(utente::text, ''), false);
  if utente is null then set role anon; else set role authenticated; end if;
end $$;
create function t.torna() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
grant usage on schema t to anon, authenticated;
grant select, insert on t.esiti to anon, authenticated;
grant usage on all sequences in schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;
create function t.utente(id uuid, email text, ruolo text, nome text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (id, email, jsonb_build_object('ruolo', ruolo, 'nome', nome, 'cognome', 'Prova', 'privacy_accettata', true));
$$;

-- ---- i personaggi ----
select t.utente('11111111-0000-0000-0000-000000000001', 't1@x.it', 'inquilino', 'Anna');
select t.utente('11111111-0000-0000-0000-000000000002', 't2@x.it', 'inquilino', 'Bruno');
select t.utente('11111111-0000-0000-0000-000000000003', 't3@x.it', 'inquilino', 'Carla');
select t.utente('11111111-0000-0000-0000-000000000004', 't4@x.it', 'inquilino', 'Dario');
select t.utente('22222222-0000-0000-0000-000000000001', 'o1@x.it', 'proprietario', 'Mario');
select t.utente('22222222-0000-0000-0000-000000000002', 'o2@x.it', 'proprietario', 'Luisa');
select t.utente('99999999-0000-0000-0000-000000000001', 's1@x.it', 'proprietario', 'Staff');
insert into staff (user_id) values ('99999999-0000-0000-0000-000000000001');
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Bilocale luminoso', 'Isola, Milano', 1250, true);
-- una casa si verifica solo DOPO che c'è la prova di proprietà
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values
 ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'proprieta', '22222222-0000-0000-0000-000000000001/proprieta-1.pdf', 'visura.pdf');
update listings set verifica_stato = 'verificato' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- candidature accettate: Anna, Carla e Dario su Bilocale
select t.come('11111111-0000-0000-0000-000000000001');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000004');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000001', 'accettata', null, null);
select decidi_candidatura('cccccccc-0000-0000-0000-000000000003', 'accettata', null, null);
select decidi_candidatura('cccccccc-0000-0000-0000-000000000004', 'accettata', null, null);
-- i contratti li crea il proprietario, in bozza (inizio nel passato)
insert into contratti (id, candidatura_id, canone, durata_mesi, data_inizio) values
 ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1250, 12, current_date - 100),
 ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 1250, 6, current_date - 400),
 ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004', 1250, 12, current_date + 30);
select t.torna();

-- ---- il contratto firmato avvisa l'inquilino ----
select t.ok((select count(*) from notifiche where tipo = 'affitto_da_confermare') = 0, 'C01 un contratto in bozza non avvisa nessuno');
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set stato = 'firmato', data_firma = current_date - 100 where id = 'dddddddd-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'affitto_da_confermare' and link = '/gestione' and dati->>'titolo' = 'Bilocale luminoso') = 1, 'C02 quando il proprietario segna il contratto «firmato» l''inquilino riceve UNA notifica, con la casa');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo like 'affitto_%') = 0, 'C03 e il proprietario non riceve niente');
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set canone = 1300 where id = 'dddddddd-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select count(*) from notifiche where tipo = 'affitto_da_confermare') = 1, 'C04 una modifica qualunque del contratto non ripete l''avviso');

-- ---- il proprietario non può rispondere al posto dell'inquilino ----
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$update contratti set inquilino_conferma_at = now() where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'RISPOSTA_RISERVATA', 'C05 il proprietario non può segnare la conferma dell''inquilino');
select t.fallisce($q$update contratti set inquilino_rifiuta_at = now() where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'RISPOSTA_RISERVATA', 'C06 né un rifiuto');
select t.fallisce($q$insert into contratti (candidatura_id, inquilino_conferma_at) values ('cccccccc-0000-0000-0000-000000000099', now())$q$, 'RISPOSTA_RISERVATA', 'C07 né crearlo già confermato');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.ok(t.righe($q$update contratti set inquilino_conferma_at = now() where id = 'dddddddd-0000-0000-0000-000000000001'$q$) = 0, 'C08 nemmeno l''inquilino scrive la conferma a mano (non ha il permesso di modificare il contratto: si passa dalla funzione)');
select t.torna();

-- ---- chi può rispondere ----
select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', true)$q$, 'CONTRATTO_NON_TUO', 'C09 un altro inquilino non può confermare');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', true)$q$, 'CONTRATTO_NON_TUO', 'C10 il proprietario non può confermare al posto dell''inquilino');
select t.torna();
select t.come(null);
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', true)$q$, 'permission denied', 'C11 chi non ha fatto l''accesso non può confermare');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select conferma_affitto_contratto('99999999-0000-0000-0000-000000000009', true)$q$, 'CONTRATTO_NON_TUO', 'C12 un contratto che non esiste: lo stesso errore (non si capisce se esiste)');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', null)$q$, 'RISPOSTA_NON_VALIDA', 'C13 una risposta vuota non vale');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000003', true)$q$, 'CONTRATTO_NON_FIRMATO', 'C14 un contratto ancora in bozza non si conferma');
select t.torna();
-- Dario: contratto firmato ma l'affitto comincia fra 30 giorni
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set stato = 'firmato' where id = 'dddddddd-0000-0000-0000-000000000004';
select t.torna();
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000004', true)$q$, 'AFFITTO_NON_ANCORA_INIZIATO', 'C15 un affitto che comincia nel futuro non si conferma ancora');
select t.torna();
update contratti set data_inizio = null, data_firma = null where id = 'dddddddd-0000-0000-0000-000000000004';
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000004', true)$q$, 'DATI_MANCANTI', 'C16 senza una data di inizio non si conferma');
select t.torna();
select t.ok((select count(*) from rapporti_locazione) = 0, 'C17 finora nessun affitto è nato');

-- ---- Anna CONFERMA ----
select t.come('11111111-0000-0000-0000-000000000001');
create temp table r1 as select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', true) as id; grant select on r1 to public;
select t.torna();
select t.ok((select id from r1) is not null, 'C18 confermando si riceve l''identificativo dell''affitto');
select t.ok((select count(*) from rapporti_locazione where id = (select id from r1) and owner_id = '22222222-0000-0000-0000-000000000001' and tenant_id = '11111111-0000-0000-0000-000000000001' and listing_id = 'aaaaaaaa-0000-0000-0000-000000000001' and stato = 'da_verificare' and contratto_id = 'dddddddd-0000-0000-0000-000000000001' and creato_da = '11111111-0000-0000-0000-000000000001' and documento_path is null and periodo_a is null and periodo_da = current_date - 100) = 1, 'C19 nasce l''affitto: «da verificare», in corso, collegato al contratto, con l''inizio del contratto, senza documento');
select t.ok((select inquilino_conferma_at from contratti where id = 'dddddddd-0000-0000-0000-000000000001') is not null, 'C20 il contratto ricorda che l''inquilino ha confermato');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo = 'affitto_confermato' and link = '/gestione-affitti' and dati->>'titolo' = 'Bilocale luminoso') = 1, 'C21 il proprietario riceve UNA notifica «affitto confermato»');
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000001', false)$q$, 'GIA_RISPOSTO', 'C22 non si risponde due volte (nemmeno per tornare indietro)');
select t.torna();

-- ---- niente si verifica alla cieca ----
select t.come('99999999-0000-0000-0000-000000000001');
select t.fallisce(format('select esito_rapporto(%L, true, null)', (select id from r1)), 'MANCA_DOCUMENTO', 'C23 lo staff non può verificare un affitto da contratto senza il documento');
select t.fallisce(format('select esito_rapporto(%L, false, ''manca il documento'')', (select id from r1)), 'MANCA_DOCUMENTO', 'C24 e nemmeno respingerlo: prima serve il documento');
select t.torna();
select t.ok((select stato from rapporti_locazione where id = (select id from r1)) = 'da_verificare', 'C25 e lo stato non cambia');
select t.come('11111111-0000-0000-0000-000000000001');
select t.ok(t.righe(format('delete from rapporti_locazione where id = %L', (select id from r1))) = 0, 'C26 l''inquilino non può ritirare un affitto nato da un contratto (la sua origine è il contratto)');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok(t.righe(format('delete from rapporti_locazione where id = %L', (select id from r1))) = 0, 'C27 e nemmeno il proprietario');
select t.torna();

-- ---- una delle due parti carica il documento ----
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '11111111-0000-0000-0000-000000000001/contratto-aaaa.pdf'), ('documenti-verifica', '22222222-0000-0000-0000-000000000001/contratto-bbbb.pdf'), ('documenti-verifica', '11111111-0000-0000-0000-000000000001/altro-cccc.pdf');
select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', (select id from r1), '11111111-0000-0000-0000-000000000002/contratto-zzzz.pdf'), 'RAPPORTO_NON_TUO', 'C28 un estraneo non può allegare un documento');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', (select id from r1), '22222222-0000-0000-0000-000000000001/contratto-bbbb.pdf'), 'PERCORSO_NON_VALIDO', 'C29 il file deve stare nella cartella di chi lo carica (non quella di un altro)');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', (select id from r1), '11111111-0000-0000-0000-000000000001/altro-cccc.pdf'), 'PERCORSO_NON_VALIDO', 'C30 e deve avere il nome dei contratti');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', (select id from r1), '11111111-0000-0000-0000-000000000001/contratto-mai-caricato.pdf'), 'FILE_NON_TROVATO', 'C31 e deve esistere davvero');
select t.fallisce(format('select allega_documento_rapporto(%L, null)', (select id from r1)), 'PERCORSO_NON_VALIDO', 'C32 senza file nemmeno');
select allega_documento_rapporto((select id from r1), '11111111-0000-0000-0000-000000000001/contratto-aaaa.pdf');
select t.torna();
select t.ok((select documento_path from rapporti_locazione where id = (select id from r1)) = '11111111-0000-0000-0000-000000000001/contratto-aaaa.pdf' and (select stato from rapporti_locazione where id = (select id from r1)) = 'da_verificare', 'C33 l''inquilino allega il suo documento: l''affitto è pronto per lo staff');

-- ---- lo staff verifica, poi il proprietario lascia il feedback ----
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce(format('select lascia_recensione(%L, 5::smallint, null)', (select id from r1)), 'RAPPORTO_NON_VERIFICATO', 'C34 prima della verifica il proprietario non può lasciare il feedback');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_rapporto((select id from r1), true, null);
select t.torna();
select t.ok((select stato from rapporti_locazione where id = (select id from r1)) = 'verificato', 'C35 lo staff verifica l''affitto');
select t.ok((select count(*) from notifiche where tipo = 'affitto_verificato' and user_id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001')) = 2, 'C36 entrambe le parti ricevono la notifica di verifica (la stessa degli affitti dichiarati)');
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', (select id from r1), '11111111-0000-0000-0000-000000000001/contratto-aaaa.pdf'), 'GIA_VERIFICATO', 'C37 dopo la verifica il documento non si cambia');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select lascia_recensione((select id from r1), 5::smallint, null);
select t.torna();
select t.ok((select count(*) from recensioni where tenant_id = '11111111-0000-0000-0000-000000000001' and autore_id = '22222222-0000-0000-0000-000000000001' and voto = 5 and rapporto_id = (select id from r1)) = 1, 'C38 IL FEEDBACK: il proprietario verificato lo lascia sull''affitto nato dal contratto');

-- ---- la fine dell'affitto ----
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set stato = 'concluso' where id = 'dddddddd-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select periodo_a from rapporti_locazione where id = (select id from r1)) = current_date, 'C39 un contratto concluso prima della fine prevista (12 mesi, ne sono passati 3): l''affitto finisce oggi');
-- Carla: contratto di 6 mesi cominciato 400 giorni fa, firmato e poi concluso -> finisce alla data prevista
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set stato = 'firmato', data_firma = current_date - 400 where id = 'dddddddd-0000-0000-0000-000000000003';
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
create temp table r3 as select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000003', true) as id; grant select on r3 to public;
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set stato = 'concluso' where id = 'dddddddd-0000-0000-0000-000000000003';
select t.torna();
select t.ok((select periodo_a from rapporti_locazione where id = (select id from r3)) = (current_date - 400 + interval '6 months' - interval '1 day')::date, 'C40 un contratto concluso dopo la fine prevista: l''affitto finisce alla data prevista (inizio + durata - un giorno)');

-- ---- l'inquilino dice che non è corretto, il proprietario corregge ----
select t.utente('11111111-0000-0000-0000-000000000005', 't5@x.it', 'inquilino', 'Elena');
select t.come('11111111-0000-0000-0000-000000000005');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000005');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000005', 'accettata', null, null);
insert into contratti (id, candidatura_id, canone, durata_mesi, data_inizio, stato, data_firma) values ('dddddddd-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000005', 900, 12, current_date - 50, 'firmato', current_date - 50);
select t.torna();
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000005' and tipo = 'affitto_da_confermare') = 1, 'C41 un contratto creato già «firmato» avvisa l''inquilino');
select t.come('11111111-0000-0000-0000-000000000005');
select t.ok(conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000005', false) is null, 'C42 Elena dice che non è corretto: non nasce nessun affitto');
select t.torna();
select t.ok((select count(*) from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') = 0, 'C43 infatti nessun affitto');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo = 'affitto_non_confermato' and dati->>'titolo' = 'Bilocale luminoso') = 1, 'C44 il proprietario viene avvisato che l''inquilino non ha confermato');
select t.come('11111111-0000-0000-0000-000000000005');
select t.fallisce($q$select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000005', true)$q$, 'GIA_RISPOSTO', 'C45 dopo un «non è corretto» non si cambia idea da soli');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set data_inizio = current_date - 60 where id = 'dddddddd-0000-0000-0000-000000000005';
select t.torna();
select t.ok((select inquilino_rifiuta_at from contratti where id = 'dddddddd-0000-0000-0000-000000000005') is null, 'C46 se il proprietario CORREGGE i dati, il «non è corretto» si cancella');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000005' and tipo = 'affitto_da_confermare') = 2, 'C47 e all''inquilino si chiede di nuovo (seconda notifica)');
select t.come('11111111-0000-0000-0000-000000000005');
select t.ok(conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000005', true) is not null, 'C48 ora Elena può confermare');
select t.torna();

-- ---- lo staff respinge, le parti ricaricano ----
select t.come('22222222-0000-0000-0000-000000000001');
select allega_documento_rapporto((select id from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005'), '22222222-0000-0000-0000-000000000001/contratto-bbbb.pdf');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_rapporto((select id from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005'), false, 'il contratto non è leggibile');
select t.torna();
select t.ok((select stato from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') = 'respinto' and (select esito_note from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') = 'il contratto non è leggibile', 'C49 lo staff respinge con una nota');
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '22222222-0000-0000-0000-000000000001/contratto-dddd.pdf');
select t.come('22222222-0000-0000-0000-000000000001');
select allega_documento_rapporto((select id from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005'), '22222222-0000-0000-0000-000000000001/contratto-dddd.pdf');
select t.torna();
select t.ok((select stato from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') = 'da_verificare' and (select esito_note from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') is null and (select documento_path from rapporti_locazione where contratto_id = 'dddddddd-0000-0000-0000-000000000005') like '%contratto-dddd.pdf', 'C50 ricaricando il documento l''affitto torna in attesa del controllo, senza la nota vecchia');

-- ---- un affitto già dichiarato per le stesse persone e la stessa casa non si duplica ----
insert into rapporti_locazione (owner_id, tenant_id, listing_id, periodo_da, creato_da, stato, documento_path)
  values ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 200, '11111111-0000-0000-0000-000000000004', 'verificato', '11111111-0000-0000-0000-000000000004/contratto-x.pdf');
select t.come('22222222-0000-0000-0000-000000000001');
update contratti set data_inizio = current_date - 20, data_firma = current_date - 20 where id = 'dddddddd-0000-0000-0000-000000000004';
select t.torna();
select t.come('11111111-0000-0000-0000-000000000004');
select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000004', true);
select t.torna();
select t.ok((select count(*) from rapporti_locazione where tenant_id = '11111111-0000-0000-0000-000000000004') = 1 and (select contratto_id from rapporti_locazione where tenant_id = '11111111-0000-0000-0000-000000000004') = 'dddddddd-0000-0000-0000-000000000004' and (select stato from rapporti_locazione where tenant_id = '11111111-0000-0000-0000-000000000004') = 'verificato', 'C51 se l''affitto era già stato dichiarato e verificato, non se ne crea un secondo: si collega al contratto e resta verificato');

-- ---- gli affitti dichiarati a mano non cambiano ----
select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce(format('select allega_documento_rapporto(%L, %L)', gen_random_uuid(), '11111111-0000-0000-0000-000000000002/contratto-zzzz.pdf'), 'RAPPORTO_NON_TUO', 'C52 un affitto che non esiste: lo stesso errore');
select t.torna();
insert into rapporti_locazione (id, owner_id, tenant_id, listing_id, periodo_da, creato_da, stato, documento_path) values ('eeeeeeee-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 90, '11111111-0000-0000-0000-000000000002', 'da_verificare', '11111111-0000-0000-0000-000000000002/contratto-y.pdf');
select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce($q$select allega_documento_rapporto('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002/contratto-y.pdf')$q$, 'NON_DA_CONTRATTO', 'C53 un affitto dichiarato a mano ha già il suo contratto: non si cambia da qui');
select t.ok(t.righe($q$delete from rapporti_locazione where id = 'eeeeeeee-0000-0000-0000-000000000002'$q$) = 1, 'C54 e chi lo ha dichiarato lo può ancora ritirare, come prima');
select t.torna();
insert into rapporti_locazione (id, owner_id, tenant_id, listing_id, periodo_da, creato_da, stato, documento_path) values ('eeeeeeee-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 90, '11111111-0000-0000-0000-000000000002', 'da_verificare', '11111111-0000-0000-0000-000000000002/contratto-y.pdf');
select t.come('99999999-0000-0000-0000-000000000001');
select esito_rapporto('eeeeeeee-0000-0000-0000-000000000003', true, null);
select t.torna();
select t.ok((select stato from rapporti_locazione where id = 'eeeeeeee-0000-0000-0000-000000000003') = 'verificato', 'C55 e lo staff verifica un affitto dichiarato a mano come prima (la guardia riguarda solo quelli da contratto)');

-- ---- si conferma un contratto GIÀ concluso: la fine dell'affitto è quella prevista, o oggi se si è chiuso in anticipo ----
select t.utente('11111111-0000-0000-0000-000000000006', 't6@x.it', 'inquilino', 'Franco');
select t.utente('11111111-0000-0000-0000-000000000007', 't7@x.it', 'inquilino', 'Giulia');
select t.come('11111111-0000-0000-0000-000000000006');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000006');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000007');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000007');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000006', 'accettata', null, null);
select decidi_candidatura('cccccccc-0000-0000-0000-000000000007', 'accettata', null, null);
insert into contratti (id, candidatura_id, canone, durata_mesi, data_inizio, stato, data_firma) values
 ('dddddddd-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000006', 800, 6, current_date - 300, 'concluso', current_date - 300),
 ('dddddddd-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000007', 800, 24, current_date - 100, 'concluso', current_date - 100);
select t.torna();
select t.come('11111111-0000-0000-0000-000000000006');
create temp table r6 as select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000006', true) as id; grant select on r6 to public;
select t.torna();
select t.come('11111111-0000-0000-0000-000000000007');
create temp table r7 as select conferma_affitto_contratto('dddddddd-0000-0000-0000-000000000007', true) as id; grant select on r7 to public;
select t.torna();
select t.ok((select periodo_a from rapporti_locazione where id = (select id from r6)) = (current_date - 300 + interval '6 months' - interval '1 day')::date, 'C60 si conferma un contratto GIÀ concluso dopo la fine prevista: l''affitto finisce alla data prevista');
select t.ok((select periodo_a from rapporti_locazione where id = (select id from r7)) = current_date, 'C61 e se il contratto si è concluso PRIMA della fine prevista (24 mesi, ne sono passati 3): finisce oggi, mai in una data futura');

-- ---- vincoli ----
select t.fallisce($q$insert into notifiche (user_id, tipo, link) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '/x')$q$, 'notifiche_tipo_check', 'C56 i tipi di notifica restano solo quelli noti');
select t.ok((select count(*) from notifiche where tipo in ('affitto_da_confermare', 'affitto_confermato', 'affitto_non_confermato')) >= 6, 'C57 i tre tipi nuovi sono ammessi');
select t.fallisce($q$update contratti set inquilino_conferma_at = now(), inquilino_rifiuta_at = now() where id = 'dddddddd-0000-0000-0000-000000000005'$q$, 'contratti_risposta_unica', 'C58 una risposta non può essere insieme sì e no');
select t.ok((select count(*) from t.esiti) = 60, 'C62 nessun controllo è stato saltato (ne servono 60 prima di questo)');
select 'TUTTI I CONTROLLI: ' || count(*) from t.esiti;
