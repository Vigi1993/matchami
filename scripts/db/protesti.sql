-- ============================================================
-- Prova della migrazione 0038 (verifica dei protesti da parte dello staff) su un PostgreSQL vero.
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
select t.utente('99999999-0000-0000-0000-000000000001', 's1@x.it', 'proprietario', 'Staff');
insert into staff (user_id) values ('99999999-0000-0000-0000-000000000001');
-- una casa verificata dell'owner, con la sua prova (per la vista dei candidati)
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Bilocale luminoso', 'Isola, Milano', 1250, true);
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'proprieta', '22222222-0000-0000-0000-000000000001/proprieta-1.pdf', 'visura.pdf');
update listings set verifica_stato = 'verificato' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Anna e Bruno si candidano
select t.come('11111111-0000-0000-0000-000000000001'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'); select t.torna();
select t.come('11111111-0000-0000-0000-000000000002'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'); select t.torna();

select t.ok((select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'non_avviata', 'P01 ogni inquilino parte con la verifica dei protesti «non avviata»');

-- ---- nessuno scrive lo stato a mano ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$update tenant_profiles set protesti_verifica_stato = 'verificato' where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'P02 l''inquilino non può mettersi «verificato» da solo');
select t.fallisce($q$update tenant_profiles set protesti_verificati_at = now() where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'P03 né scriversi la data di verifica');
select t.fallisce($q$update tenant_profiles set protesti_verifica_esito_note = 'tutto ok' where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'P04 né la nota dell''esito');
select t.fallisce($q$update tenant_profiles set protesti_verifica_inviata_at = now() where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'P05 né la data di invio');
select t.torna();

-- ---- la richiesta: cosa serve ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'PROTESTI_NON_DICHIARATI', 'P06 senza aver risposto alla domanda sui protesti non si chiede la verifica (non c''è niente da confrontare)');
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000001';
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'DOCUMENTI_PROTESTI_MANCANTI', 'P07 senza documenti nemmeno');
select t.torna();
insert into storage.objects (bucket_id, name) values
 ('documenti-verifica', '11111111-0000-0000-0000-000000000001/inquilino-identita-a.pdf'),
 ('documenti-verifica', '11111111-0000-0000-0000-000000000001/inquilino-protesti-a.pdf');
select t.come('11111111-0000-0000-0000-000000000001');
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000001', 'identita', '11111111-0000-0000-0000-000000000001/inquilino-identita-a.pdf', 'carta.pdf');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'DOCUMENTI_PROTESTI_MANCANTI', 'P08 con solo il documento d''identità manca il certificato dei protesti');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000001', 'protesti', '11111111-0000-0000-0000-000000000001/inquilino-reddito-zz.pdf', 'x.pdf')$q$, 'row-level security', 'P09 il certificato si registra solo con il nome che il caricamento dà ai certificati (non con quello di un''altra prova)');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '11111111-0000-0000-0000-000000000001/inquilino-tipo_inventato-zz.pdf', 'x.pdf')$q$, 'documenti_inquilino_tipo_check', 'P10 i tipi di documento restano solo quelli noti');
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000001', 'protesti', '11111111-0000-0000-0000-000000000001/inquilino-protesti-a.pdf', 'certificato-protesti.pdf');
select t.torna();
-- Dario ha il certificato ma NON il documento d'identità
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '11111111-0000-0000-0000-000000000004/inquilino-protesti-a.pdf');
select t.come('11111111-0000-0000-0000-000000000004');
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000004';
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000004', 'protesti', '11111111-0000-0000-0000-000000000004/inquilino-protesti-a.pdf', 'cert.pdf');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'DOCUMENTI_PROTESTI_MANCANTI', 'P10b con il solo certificato manca il documento d''identità');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'NON_INQUILINO', 'P11 un proprietario non può chiedere la verifica dei protesti');
select t.torna();
select t.come(null);
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'permission denied', 'P12 chi non ha fatto l''accesso nemmeno');
select t.torna();

-- ---- Anna chiede la verifica ----
select t.come('11111111-0000-0000-0000-000000000001');
select richiedi_verifica_protesti();
select t.torna();
select t.ok((select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'in_verifica' and (select protesti_verifica_inviata_at from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') is not null, 'P13 con la risposta, l''identità e il certificato la verifica parte: «in verifica», con la data di invio');
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'PROTESTI_GIA_IN_VERIFICA', 'P14 non si chiede due volte');
select t.ok(t.righe($q$delete from documenti_inquilino where tipo = 'protesti' and tenant_id = '11111111-0000-0000-0000-000000000001'$q$) = 0, 'P15 mentre è in verifica il certificato non si toglie');
select t.ok(t.righe($q$delete from documenti_inquilino where tipo = 'identita' and tenant_id = '11111111-0000-0000-0000-000000000001'$q$) = 0, 'P16 nemmeno il documento d''identità (serve anche per il reddito, ma qui serve allo staff)');
select t.ok(t.righe($q$delete from storage.objects where name = '11111111-0000-0000-0000-000000000001/inquilino-protesti-a.pdf'$q$) = 0, 'P17 e il FILE del certificato non si cancella dall''archivio');
select t.torna();

-- ---- lo staff ----
select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'nessun_protesto', null)$q$, 'NON_STAFF', 'P18 un inquilino non può dare l''esito (nemmeno su se stesso)');
select t.fallisce($q$select * from protesti_da_verificare()$q$, 'NON_STAFF', 'P19 né vedere l''elenco');
select t.fallisce($q$select * from dati_per_verifica_protesti('11111111-0000-0000-0000-000000000001')$q$, 'NON_STAFF', 'P20 né i dati di un altro');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'nessun_protesto', null)$q$, 'NON_STAFF', 'P21 e nemmeno un proprietario');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select t.ok((select count(*) from protesti_da_verificare()) = 1 and (select nome from protesti_da_verificare()) = 'Anna', 'P22 lo staff vede nell''elenco solo chi è in verifica');
select t.ok((select protestato from dati_per_verifica_protesti('11111111-0000-0000-0000-000000000001')) = false and (select protesti_verifica_stato from dati_per_verifica_protesti('11111111-0000-0000-0000-000000000001')) = 'in_verifica', 'P23 e legge ciò che la persona ha dichiarato (nessun protesto) per confrontarlo con il certificato');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'forse', null)$q$, 'ESITO_NON_VALIDO', 'P24 un esito inventato non vale');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'respingi', null)$q$, 'PROTESTI_NOTA_OBBLIGATORIA', 'P25 per respingere serve dire perché');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'respingi', '  ')$q$, 'PROTESTI_NOTA_OBBLIGATORIA', 'P26 una nota vuota non vale');
select t.fallisce($q$select esito_verifica_protesti('11111111-0000-0000-0000-000000000003', 'nessun_protesto', null)$q$, 'PROTESTI_NON_IN_VERIFICA', 'P27 non si decide su chi non ha chiesto la verifica');
select t.fallisce($q$select esito_verifica_protesti('99999999-0000-0000-0000-0000000000ff', 'nessun_protesto', null)$q$, 'INQUILINO_INESISTENTE', 'P28 né su chi non esiste');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'respingi', 'Il certificato è illeggibile: caricane uno più nitido');
select t.torna();
select t.ok((select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'non_avviata' and (select protesti_verifica_esito_note from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'Il certificato è illeggibile: caricane uno più nitido', 'P29 respinto: torna «non avviata», con la nota che la persona leggerà');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'protesti_respinti' and link = '/profilo') = 1, 'P30 e riceve una notifica «protesti respinti»');
select t.come('11111111-0000-0000-0000-000000000001');
select t.ok(t.righe($q$delete from documenti_inquilino where tipo = 'protesti' and tenant_id = '11111111-0000-0000-0000-000000000001'$q$) = 1, 'P31 dopo il rifiuto il certificato si può togliere (e caricarne un altro)');
select t.torna();
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000001', 'protesti', '11111111-0000-0000-0000-000000000001/inquilino-protesti-b.pdf', 'certificato-nuovo.pdf');
select t.come('11111111-0000-0000-0000-000000000001');
select richiedi_verifica_protesti();
select t.torna();
select t.ok((select protesti_verifica_esito_note from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') is null, 'P32 chiedendo di nuovo la nota vecchia sparisce');

-- ---- nessun protesto: verificato ----
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000001', 'nessun_protesto', null);
select t.torna();
select t.ok((select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'verificato' and (select protestato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = false and (select protesti_verificati_at from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') is not null, 'P33 «nessun protesto»: verificato, protestato = no, con la data');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'protesti_verificati' and (dati->>'protestato')::boolean = false) = 1, 'P34 la notifica dice che non risultano protesti');

-- ---- una volta verificato, non si cambia da soli ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$update tenant_profiles set protestato = true where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'PROTESTI_VERIFICATI', 'P35 i protesti verificati non si cambiano da soli');
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000001';
select t.ok(true, 'P36 riscrivere lo STESSO valore (come fa il salvataggio dei dati) non dà errore');
update tenant_profiles set professione = 'Insegnante' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.ok((select professione from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'Insegnante', 'P37 e il resto dei dati si modifica come prima');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'PROTESTI_GIA_VERIFICATI', 'P38 non si richiede una verifica già fatta');
select t.ok(t.righe($q$delete from documenti_inquilino where tipo = 'protesti' and tenant_id = '11111111-0000-0000-0000-000000000001'$q$) = 0, 'P39 il certificato di una verifica fatta non si toglie');
select t.torna();

-- ---- il reddito è indipendente ----
select t.ok((select verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'non_avviata' and (select verificato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = false, 'P40 verificare i protesti non verifica il reddito');
update tenant_profiles set verificato = true, verifica_stato = 'verificato' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set reddito_mensile = 1800 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select verificato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = false and (select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001') = 'verificato', 'P41 cambiare il reddito azzera SOLO la verifica del reddito: i protesti restano verificati');

-- ---- Bruno dichiarava «nessun protesto» ma il certificato dice il contrario ----
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '11111111-0000-0000-0000-000000000002/inquilino-identita-a.pdf'), ('documenti-verifica', '11111111-0000-0000-0000-000000000002/inquilino-protesti-a.pdf');
select t.come('11111111-0000-0000-0000-000000000002');
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000002';
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000002', 'identita', '11111111-0000-0000-0000-000000000002/inquilino-identita-a.pdf', 'carta.pdf'), ('11111111-0000-0000-0000-000000000002', 'protesti', '11111111-0000-0000-0000-000000000002/inquilino-protesti-a.pdf', 'cert.pdf');
select richiedi_verifica_protesti();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000002', 'protestato', null);
select t.torna();
select t.ok((select protestato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000002') = true and (select protesti_verifica_stato::text from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000002') = 'verificato', 'P42 il risultato dello staff PREVALE sulla dichiarazione: dichiarava «nessun protesto», il certificato dice che ce ne sono: ora risulta protestato, verificato');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000002' and tipo = 'protesti_verificati' and (dati->>'protestato')::boolean = true) = 1, 'P43 e la notifica lo dice');

-- ---- il documento d'identità serve alle due verifiche ----
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '11111111-0000-0000-0000-000000000003/inquilino-identita-a.pdf'), ('documenti-verifica', '11111111-0000-0000-0000-000000000003/inquilino-protesti-a.pdf');
select t.come('11111111-0000-0000-0000-000000000003');
update tenant_profiles set protestato = true where profile_id = '11111111-0000-0000-0000-000000000003';
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000003', 'identita', '11111111-0000-0000-0000-000000000003/inquilino-identita-a.pdf', 'carta.pdf'), ('11111111-0000-0000-0000-000000000003', 'protesti', '11111111-0000-0000-0000-000000000003/inquilino-protesti-a.pdf', 'cert.pdf');
select t.ok(t.righe($q$delete from storage.objects where name = '11111111-0000-0000-0000-000000000003/inquilino-protesti-a.pdf'$q$) = 1, 'P44 prima dell''invio il file del certificato si toglie dall''archivio');
insert into storage.objects (bucket_id, name) values ('documenti-verifica', '11111111-0000-0000-0000-000000000003/inquilino-protesti-b.pdf');
insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file) values ('11111111-0000-0000-0000-000000000003', 'protesti', '11111111-0000-0000-0000-000000000003/inquilino-protesti-b.pdf', 'cert2.pdf');
select richiedi_verifica_protesti();
select t.ok(t.righe($q$delete from storage.objects where name = '11111111-0000-0000-0000-000000000003/inquilino-identita-a.pdf'$q$) = 0, 'P45 con i protesti in verifica il documento d''identità non si cancella dall''archivio (anche se il reddito non è partito)');
select t.torna();

-- ---- il proprietario vede solo «verificato: sì/no» ----
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select protesti_verificati from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000001') = true, 'P46 il proprietario vede che i protesti di Anna sono verificati (sì)');
select t.ok((select protesti_verificati from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000002') = true and (select protestato from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000002') = true, 'P47 e di Bruno: verificato, con il valore verificato (protestato)');
select t.fallisce($q$select tenant_id, protesti_verifica_note from candidati_del_proprietario$q$, 'column', 'P48 ma non vede la nota dell''esito né lo stato interno');
select t.ok((select count(*) from documenti_inquilino) = 0, 'P49 e non legge nessun documento degli inquilini');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000002');
select t.ok((select count(*) from documenti_inquilino) = 2 and (select count(*) from documenti_inquilino where tenant_id <> '11111111-0000-0000-0000-000000000002') = 0, 'P50 un inquilino vede solo i propri documenti');
select t.torna();

-- ---- chi è stato scartato: niente sui protesti ----
select t.come('11111111-0000-0000-0000-000000000004'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004'); select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000004', 'rifiutata', 'altro_candidato', '{"match":{"punteggio":10}}'::jsonb);
select t.ok((select protesti_verificati from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000004') is null and (select protestato from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000004') is null, 'P50b di un candidato SCARTATO il proprietario non vede più niente sui protesti (né il valore né se è verificato)');
select t.torna();

-- ---- i tipi di notifica ----
select t.fallisce($q$insert into notifiche (user_id, tipo, link) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '/x')$q$, 'notifiche_tipo_check', 'P51 i tipi di notifica restano solo quelli noti');
select t.ok((select count(*) from notifiche where tipo in ('protesti_verificati', 'protesti_respinti')) = 3, 'P52 i due tipi nuovi sono ammessi');
select t.ok((select count(*) from t.esiti) = 54, 'P53 nessun controllo è stato saltato (ne servono 54 prima di questo)');
select 'TUTTI I CONTROLLI: ' || count(*) from t.esiti;
