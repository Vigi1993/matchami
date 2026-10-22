-- ============================================================
-- Prova della migrazione 0040 (le verifiche SCADONO; il reddito del nucleo si documenta persona per persona) su un PostgreSQL vero.
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
create function t.come(utente uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(utente::text, ''), false);
  if utente is null then set role anon; else set role authenticated; end if;
end $$;
create function t.come_servizio() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); set role service_role; end $$;
create function t.torna() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
create table t.d (n text primary key, id uuid);
grant usage on schema t to anon, authenticated, service_role;
grant select, insert on t.esiti to anon, authenticated, service_role;
grant select, insert on t.d to anon, authenticated, service_role;
grant usage on all sequences in schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;
create function t.utente(id uuid, email text, ruolo text, nome text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (id, email, jsonb_build_object('ruolo', ruolo, 'nome', nome, 'cognome', 'Prova', 'privacy_accettata', true));
$$;
-- registra un documento della persona che sta agendo (vale la regola di sicurezza della tabella) e ne ricorda l'identificativo col nome dato
create function t.doc(p_tenant uuid, p_tipo text, p_persona int, p_n text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, persona)
  values (p_tenant, p_tipo, p_tenant::text || '/inquilino-' || p_tipo || '-' || p_n || '.pdf', p_n || '.pdf', p_persona) returning id into v;
  insert into t.d values (p_n, v);
end $$;
create function t.id(p_n text) returns uuid language sql as $$ select id from t.d where n = p_n $$;
create function t.fatto(p text) returns int language sql as $$ select count(*)::int from file_da_eliminare where percorso like '%/inquilino-%-' || p || '.pdf' $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- ---- i personaggi ----
select t.utente('11111111-0000-0000-0000-000000000001', 't1@x.it', 'inquilino', 'Anna');
select t.utente('11111111-0000-0000-0000-000000000002', 't2@x.it', 'inquilino', 'Bruno');
select t.utente('11111111-0000-0000-0000-000000000003', 't3@x.it', 'inquilino', 'Carla');
select t.utente('11111111-0000-0000-0000-000000000004', 't4@x.it', 'inquilino', 'Dario');
select t.utente('11111111-0000-0000-0000-000000000005', 't5@x.it', 'inquilino', 'Elena');
select t.utente('11111111-0000-0000-0000-000000000006', 't6@x.it', 'inquilino', 'Franco');
select t.utente('11111111-0000-0000-0000-000000000007', 't7@x.it', 'inquilino', 'Giada');
select t.utente('11111111-0000-0000-0000-000000000008', 't8@x.it', 'inquilino', 'Hugo');
select t.utente('11111111-0000-0000-0000-000000000009', 't9@x.it', 'inquilino', 'Irene');
select t.utente('11111111-0000-0000-0000-000000000010', 't10@x.it', 'inquilino', 'Lia');
select t.utente('22222222-0000-0000-0000-000000000001', 'o1@x.it', 'proprietario', 'Mario');
select t.utente('99999999-0000-0000-0000-000000000001', 's1@x.it', 'proprietario', 'Staff');
insert into staff (user_id) values ('99999999-0000-0000-0000-000000000001');
-- una casa verificata del proprietario e le candidature di Anna, Bruno e Carla (per la vista dei candidati)
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Bilocale luminoso', 'Isola, Milano', 1250, true);
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'proprieta', '22222222-0000-0000-0000-000000000001/proprieta-prova.pdf', 'visura.pdf');
update listings set verifica_stato = 'verificato' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'); select t.torna();
select t.come('11111111-0000-0000-0000-000000000002'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'); select t.torna();
select t.come('11111111-0000-0000-0000-000000000003'); insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'); select t.torna();

-- ---- le regole di base ----
select t.ok((select validita_verifica('reddito') = interval '6 months' and validita_verifica('protesti') = interval '3 months' and validita_verifica('altro') is null), 'S01 la validità è 6 mesi per il reddito e 3 per i protesti (come in lib/scadenze-verifiche.ts), e un tipo sconosciuto non ne ha');
select t.ok((select reddito_scade_il is null and reddito_verificato_at is null and reddito_nucleo_verificato is null and protesti_scade_il is null and situazione_confermata_at is null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S02 ogni inquilino parte senza scadenze né date di verifica');
select t.ok((select not reddito_valido(t) and not protesti_validi(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'), 'S03 senza verifica non c''è niente di valido');

-- ---- nessuno scrive a mano le date e le scadenze ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$update tenant_profiles set reddito_scade_il = now() + interval '5 years' where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S04 l''inquilino non può scriversi una scadenza del reddito');
select t.fallisce($q$update tenant_profiles set reddito_verificato_at = now() where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S05 né la data della verifica del reddito');
select t.fallisce($q$update tenant_profiles set reddito_nucleo_verificato = 9999 where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S06 né il reddito del nucleo verificato');
select t.fallisce($q$update tenant_profiles set protesti_scade_il = now() + interval '5 years' where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S07 né la scadenza dei protesti');
select t.fallisce($q$update tenant_profiles set situazione_confermata_at = now() where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S08 né la conferma della situazione (si fa con il pulsante, che controlla che ci sia qualcosa di valido)');
select t.fallisce($q$update tenant_profiles set verificato = true where profile_id = '11111111-0000-0000-0000-000000000001'$q$, 'VERIFICA_RISERVATA', 'S09 e resta vietato dichiararsi verificati');
select t.torna();

-- ---- i documenti: la persona NON scrive ciò che spetta allo staff ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, persona, importo_verificato) values ('11111111-0000-0000-0000-000000000001', 'reddito', '11111111-0000-0000-0000-000000000001/inquilino-reddito-furbo.pdf', 'f.pdf', 1, 5000)$q$, 'row-level security', 'S10 un documento con un importo «verificato» scritto dalla persona viene rifiutato');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, persona, verificato_at) values ('11111111-0000-0000-0000-000000000001', 'reddito', '11111111-0000-0000-0000-000000000001/inquilino-reddito-furbo2.pdf', 'f.pdf', 1, now())$q$, 'row-level security', 'S11 né un documento già «verificato»');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, persona) values ('11111111-0000-0000-0000-000000000001', 'reddito', '11111111-0000-0000-0000-000000000001/inquilino-reddito-sette.pdf', 's.pdf', 7)$q$, 'documenti_inquilino_persona_check', 'S12 le persone del nucleo vanno da 1 a 6');
select t.torna();
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, importo_verificato) values ('11111111-0000-0000-0000-000000000001', 'identita', '11111111-0000-0000-0000-000000000001/inquilino-identita-x.pdf', 'x.pdf', 100)$q$, 'documenti_inquilino_importo_check', 'S13 un importo ha senso solo su una prova del reddito');
select t.fallisce($q$insert into documenti_inquilino (tenant_id, tipo, percorso, nome_file, importo_verificato) values ('11111111-0000-0000-0000-000000000001', 'reddito', '11111111-0000-0000-0000-000000000001/inquilino-reddito-y.pdf', 'y.pdf', 0)$q$, 'documenti_inquilino_importo_check', 'S14 e deve essere positivo');

-- =====================================================================
-- ANNA: dichiara 3.000 € di reddito del nucleo, un solo percettore, una sola busta paga da 1.500 € (il caso che ha fatto nascere la funzione)
-- =====================================================================
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set professione = 'Impiegata', reddito_mensile = 1500, reddito_nucleo = 3000, redditi_nucleo = 1 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S15 senza documenti non si chiede la verifica');
select t.doc('11111111-0000-0000-0000-000000000001', 'identita', 1, 'a-id');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S16 l''identità da sola non basta: serve la prova del reddito');
select t.doc('11111111-0000-0000-0000-000000000001', 'reddito', 1, 'a-r1');
select richiedi_verifica_inquilino();
select t.torna();
select t.ok((select verifica_stato::text = 'in_verifica' and not verificato from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S17 con identità e una prova la verifica parte (e non è ancora verificata)');

select t.come('99999999-0000-0000-0000-000000000001');
select t.fallisce($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null)$q$, 'IMPORTI_OBBLIGATORI', 'S18 lo staff non può verificare senza scrivere gli importi');
select t.fallisce($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, '[]'::jsonb)$q$, 'IMPORTI_OBBLIGATORI', 'S19 nemmeno con una lista vuota');
select t.fallisce(format($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, '[{"documento": "%s", "importo": 0}]'::jsonb)$q$, t.id('a-r1')), 'IMPORTI_NON_VALIDI', 'S20 un importo zero non vale');
select t.fallisce(format($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, '[{"documento": "%s", "importo": 1500}]'::jsonb)$q$, t.id('a-id')), 'IMPORTI_NON_VALIDI', 'S21 un importo si scrive solo su una prova del reddito (non sull''identità)');
select t.fallisce($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, '[{"documento": "non-un-uuid", "importo": 1500}]'::jsonb)$q$, 'IMPORTI_NON_VALIDI', 'S22 un identificativo inventato viene rifiutato');
select t.fallisce(format($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, '[{"documento": "%s", "importo": 100001}]'::jsonb)$q$, t.id('a-r1')), 'IMPORTI_NON_VALIDI', 'S23 né un importo fuori scala');
select t.torna();
select t.ok((select importo_verificato is null from documenti_inquilino where id = t.id('a-r1')), 'S24 un tentativo fallito non lascia importi scritti a metà');

select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, jsonb_build_array(jsonb_build_object('documento', t.id('a-r1'), 'importo', 1500)));
select t.torna();
select t.ok((select verificato and verifica_stato::text = 'verificato' and reddito_nucleo_verificato = 1500 and reddito_verificato_at is not null and situazione_confermata_at is not null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S25 verificato: il nucleo verificato è 1.500 € su 3.000 dichiarati (il sistema ora lo sa)');
select t.ok((select reddito_scade_il between now() + interval '6 months' - interval '1 minute' and now() + interval '6 months' + interval '1 minute' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S26 la scadenza è a 6 mesi da ora');
select t.ok((select count(*) = 2 and bool_and(verificato_at is not null) from documenti_inquilino where tenant_id = '11111111-0000-0000-0000-000000000001'), 'S27 i documenti usati ora sono segnati come verificati');
select t.ok((select importo_verificato = 1500 from documenti_inquilino where id = t.id('a-r1')), 'S28 e la prova ha il suo importo');
select t.ok((select count(*) = 1 from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'reddito_verificato'), 'S29 la persona riceve la notifica «reddito verificato»');
select t.ok((select reddito_valido(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'), 'S30 la verifica ora vale');

select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select verificato and reddito_nucleo_verificato = 1500 and reddito_nucleo = 3000 and not reddito_scaduto and reddito_verificato_at is not null from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000001'), 'S31 il proprietario vede «verificato», 1.500 verificati su 3.000 dichiarati, e la data');
select t.torna();

-- ---- la scadenza: il rinnovo ----
update tenant_profiles set reddito_scade_il = now() + interval '60 days', reddito_nucleo_verificato = 3000 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'INQUILINO_GIA_VERIFICATO', 'S32 con 60 giorni davanti e tutto il reddito del nucleo documentato non c''è niente da rinnovare');
select t.torna();
update tenant_profiles set reddito_scade_il = now() + interval '20 days' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S33 a 20 giorni si può rinnovare, ma serve una prova NUOVA (quella già verificata non conta)');
select t.doc('11111111-0000-0000-0000-000000000001', 'reddito', 1, 'a-r2');
select richiedi_verifica_inquilino();
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'INQUILINO_GIA_IN_VERIFICA', 'S34 un rinnovo già mandato non si rimanda');
select t.torna();
select t.ok((select verifica_stato::text = 'in_verifica' and verificato and reddito_valido(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'), 'S35 durante il rinnovo la verifica vecchia VALE ancora (nessun buco)');
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select verificato and not reddito_scaduto from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000001'), 'S36 e il proprietario continua a vederla verificata');
select t.torna();

-- ---- rinnovo RESPINTO con la verifica vecchia ancora valida ----
select t.come('99999999-0000-0000-0000-000000000001');
select t.fallisce($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', false, ' ')$q$, 'INQUILINO_NOTA_OBBLIGATORIA', 'S37 respingere richiede un motivo');
select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', false, 'La busta paga è illeggibile');
select t.torna();
select t.ok((select verifica_stato::text = 'verificato' and verificato and verifica_esito_note = 'La busta paga è illeggibile' and reddito_valido(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'), 'S38 rinnovo respinto: la verifica vecchia resta valida, con il motivo');
select t.ok((select not exists (select 1 from documenti_inquilino where id = t.id('a-r2')) and t.fatto('a-r2') = 1), 'S39 la prova respinta si cancella e il file va nella coda di pulizia');
select t.ok((select count(*) = 1 from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'reddito_respinto') and (select count(*) = 1 from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'reddito_verificato'), 'S40 arriva «respinto», non un altro «verificato»');
select t.ok((select reddito_scade_il between now() + interval '19 days' and now() + interval '21 days' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S41 la scadenza non è cambiata');

-- ---- rinnovo riuscito: ora Anna documenta tutto (3.000) ----
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set reddito_mensile = 1500 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.doc('11111111-0000-0000-0000-000000000001', 'reddito', 1, 'a-r3');
select richiedi_verifica_inquilino();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', true, null, jsonb_build_array(jsonb_build_object('documento', t.id('a-r3'), 'importo', 3000)));
select t.torna();
select t.ok((select verificato and verifica_stato::text = 'verificato' and verifica_esito_note is null and reddito_nucleo_verificato = 3000 and reddito_scade_il between now() + interval '6 months' - interval '1 minute' and now() + interval '6 months' + interval '1 minute' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S42 rinnovo riuscito: nuova scadenza a 6 mesi e nucleo verificato 3.000');
select t.ok((select not exists (select 1 from documenti_inquilino where id = t.id('a-r1')) and t.fatto('a-r1') = 1 and exists (select 1 from documenti_inquilino where id = t.id('a-r3') and verificato_at is not null)), 'S43 la prova vecchia, sostituita, si cancella (file in coda); quella nuova è la verificata');
select t.ok((select exists (select 1 from documenti_inquilino where id = t.id('a-id'))), 'S44 l''identità, se non ne arriva una nuova, resta');
select t.ok((select count(*) = 2 from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'reddito_verificato'), 'S45 e arriva la notifica di verifica riuscita');

-- ---- scaduta davvero ----
update tenant_profiles set reddito_scade_il = now() - interval '1 day' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.ok((select not reddito_valido(t) and verificato from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000001'), 'S46 la scadenza si CALCOLA alla lettura: nessun lavoro periodico serve perché smetta di valere');
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select not verificato and reddito_scaduto and reddito_nucleo_verificato = 3000 from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000001'), 'S47 il proprietario vede «non verificato» e «scaduto»: mai «verificato»');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.doc('11111111-0000-0000-0000-000000000001', 'reddito', 1, 'a-r4');
select richiedi_verifica_inquilino();
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select not verificato and reddito_scaduto from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000001'), 'S48 da scaduta, con il rinnovo in corso, non vale: serve la risposta dello staff');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_inquilino('11111111-0000-0000-0000-000000000001', false, 'Documento di un altro periodo');
select t.torna();
select t.ok((select not verificato and verifica_stato::text = 'non_avviata' and reddito_scade_il is null and reddito_nucleo_verificato is null and reddito_verificato_at is null and verifica_esito_note is not null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S49 rinnovo respinto da scaduta: torna «non verificato» con il motivo, senza date residue');

-- ---- cambiare i dati azzera la verifica ----
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '5 months', reddito_verificato_at = now(), reddito_nucleo_verificato = 3000, professione = 'Impiegata' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set presentazione = 'Ciao, cerco casa' where profile_id = '11111111-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select verificato and reddito_scade_il is not null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S50 cambiare la presentazione non toglie la verifica');
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set redditi_nucleo = 2 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select not verificato and verifica_stato::text = 'non_avviata' and reddito_scade_il is null and reddito_nucleo_verificato is null and reddito_verificato_at is null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S51 cambiare quante persone hanno un reddito azzera la verifica e tutte le date');
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '5 months', reddito_verificato_at = now(), reddito_nucleo_verificato = 3000, redditi_nucleo = 1 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.come('11111111-0000-0000-0000-000000000001');
update tenant_profiles set reddito_mensile = 1800 where profile_id = '11111111-0000-0000-0000-000000000001';
select t.torna();
select t.ok((select not verificato and reddito_scade_il is null and reddito_nucleo_verificato is null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000001'), 'S52 e cambiare il reddito (come prima) azzera tutto');

-- =====================================================================
-- BRUNO: due percettori; una prova per persona; la stessa persona non si conta due volte
-- =====================================================================
select t.come('11111111-0000-0000-0000-000000000002');
update tenant_profiles set professione = 'Cuoco', reddito_mensile = 1500, reddito_nucleo = 3000, redditi_nucleo = 2 where profile_id = '11111111-0000-0000-0000-000000000002';
select t.doc('11111111-0000-0000-0000-000000000002', 'identita', 1, 'b-id');
select t.doc('11111111-0000-0000-0000-000000000002', 'reddito', 1, 'b-r1');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S53 con due redditi nel nucleo serve la prova di entrambi: una non basta');
select t.doc('11111111-0000-0000-0000-000000000002', 'reddito', 1, 'b-r1bis');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S54 due prove della stessa persona non coprono l''altra');
select t.doc('11111111-0000-0000-0000-000000000002', 'reddito', 2, 'b-r2');
select t.doc('11111111-0000-0000-0000-000000000002', 'reddito', 2, 'b-r2scarto');
select t.doc('11111111-0000-0000-0000-000000000002', 'reddito', 3, 'b-r3fuori');
select richiedi_verifica_inquilino();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select t.fallisce(format($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000002', true, null, '[{"documento": "%s", "importo": 1500}]'::jsonb)$q$, t.id('b-r1')), 'IMPORTI_PERSONE_MANCANTI', 'S55 lo staff non può verificare se una persona del nucleo non ha una prova riconosciuta');
select t.fallisce(format($q$select esito_verifica_inquilino('11111111-0000-0000-0000-000000000002', true, null, '[{"documento": "%s", "importo": 1500}, {"documento": "%s", "importo": 1500}]'::jsonb)$q$, t.id('b-r1'), t.id('a-r3')), 'IMPORTI_NON_VALIDI', 'S56 né usare il documento di un altro inquilino');
select esito_verifica_inquilino('11111111-0000-0000-0000-000000000002', true, null, jsonb_build_array(
  jsonb_build_object('documento', t.id('b-r1'), 'importo', 1400), jsonb_build_object('documento', t.id('b-r1bis'), 'importo', 1500),
  jsonb_build_object('documento', t.id('b-r2'), 'importo', 1600), jsonb_build_object('documento', t.id('b-r3fuori'), 'importo', 900)));
select t.torna();
select t.ok((select reddito_nucleo_verificato = 3100 from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000002'), 'S57 il nucleo verificato è 1.500 (la prova più alta della persona 1, UNA volta) + 1.600 (persona 2) = 3.100; la persona 3, fuori dal nucleo, non conta');
select t.ok((select not exists (select 1 from documenti_inquilino where id = t.id('b-r2scarto')) and t.fatto('b-r2scarto') = 1), 'S58 la prova non riconosciuta dallo staff si scarta (file in coda)');
select t.ok((select count(*) = 5 from documenti_inquilino where tenant_id = '11111111-0000-0000-0000-000000000002' and verificato_at is not null), 'S59 restano l''identità e le quattro prove riconosciute, tutte segnate come verificate');

-- =====================================================================
-- CARLA: i protesti, con scadenza e rinnovo
-- =====================================================================
select t.come('11111111-0000-0000-0000-000000000003');
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000003';
select t.doc('11111111-0000-0000-0000-000000000003', 'identita', 1, 'c-id');
select t.doc('11111111-0000-0000-0000-000000000003', 'protesti', 1, 'c-p1');
select richiedi_verifica_protesti();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000003', 'nessun_protesto');
select t.torna();
select t.ok((select protesti_verifica_stato::text = 'verificato' and protesti_validi(t) and protesti_scade_il between now() + interval '3 months' - interval '1 minute' and now() + interval '3 months' + interval '1 minute' and not protestato and situazione_confermata_at is null from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000003'), 'S60 protesti verificati: valgono 3 mesi (e non toccano la conferma di lavoro e reddito)');
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce($q$update tenant_profiles set protestato = true where profile_id = '11111111-0000-0000-0000-000000000003'$q$, 'PROTESTI_VERIFICATI', 'S61 finché la verifica vale, la risposta non si cambia da soli');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select protesti_verificati and not protesti_scaduti and protesti_verificati_at is not null from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000003'), 'S62 il proprietario vede «protesti verificati» e la data');
select t.torna();
update tenant_profiles set protesti_scade_il = now() - interval '1 day' where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select not protesti_verificati and protesti_scaduti from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000003'), 'S63 scaduti: il proprietario non li vede più come verificati e lo legge «scaduta»');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
update tenant_profiles set protestato = true where profile_id = '11111111-0000-0000-0000-000000000003';
update tenant_profiles set protestato = false where profile_id = '11111111-0000-0000-0000-000000000003';
select t.torna();
select t.ok(true, 'S64 scaduta la verifica la risposta si può correggere (poi si rinnova)');
update tenant_profiles set protesti_scade_il = now() + interval '60 days' where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'PROTESTI_GIA_VERIFICATI', 'S65 con 60 giorni davanti non c''è niente da rinnovare');
select t.torna();
update tenant_profiles set protesti_scade_il = now() + interval '20 days' where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce($q$select richiedi_verifica_protesti()$q$, 'DOCUMENTI_PROTESTI_MANCANTI', 'S66 a 20 giorni si può rinnovare ma serve un certificato NUOVO');
select t.doc('11111111-0000-0000-0000-000000000003', 'protesti', 1, 'c-p2');
select richiedi_verifica_protesti();
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select protesti_verificati from candidati_del_proprietario where tenant_id = '11111111-0000-0000-0000-000000000003'), 'S67 durante il rinnovo la verifica vecchia vale ancora');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000003', 'respingi', 'Il certificato è di un altro anno');
select t.torna();
select t.ok((select protesti_verifica_stato::text = 'verificato' and protesti_validi(t) and protesti_verifica_esito_note = 'Il certificato è di un altro anno' from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000003') and t.fatto('c-p2') = 1, 'S68 rinnovo respinto: la verifica vecchia resta, con il motivo; il certificato nuovo si scarta (file in coda)');
select t.ok((select count(*) = 1 from notifiche where user_id = '11111111-0000-0000-0000-000000000003' and tipo = 'protesti_respinti') and (select count(*) = 1 from notifiche where user_id = '11111111-0000-0000-0000-000000000003' and tipo = 'protesti_verificati'), 'S69 e arriva «respinto», non «verificato»');
select t.come('11111111-0000-0000-0000-000000000003');
select t.doc('11111111-0000-0000-0000-000000000003', 'protesti', 1, 'c-p3');
select richiedi_verifica_protesti();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000003', 'protestato');
select t.torna();
select t.ok((select protestato and protesti_verifica_stato::text = 'verificato' and protesti_verifica_esito_note is null and protesti_scade_il > now() + interval '89 days' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000003') and t.fatto('c-p1') = 1, 'S70 rinnovo riuscito con «protestato»: prevale lo staff, nuova scadenza, certificato vecchio in coda');
select t.ok((select count(*) = 2 from notifiche where user_id = '11111111-0000-0000-0000-000000000003' and tipo = 'protesti_verificati'), 'S71 e arriva la notifica di verifica riuscita');
update tenant_profiles set protesti_scade_il = now() - interval '1 day' where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('11111111-0000-0000-0000-000000000003');
select t.doc('11111111-0000-0000-0000-000000000003', 'protesti', 1, 'c-p4');
select richiedi_verifica_protesti();
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select esito_verifica_protesti('11111111-0000-0000-0000-000000000003', 'respingi', 'Illeggibile');
select t.torna();
select t.ok((select protesti_verifica_stato::text = 'non_avviata' and protesti_scade_il is null from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000003'), 'S72 rinnovo respinto da scaduta: torna «non verificato», senza date residue');

-- =====================================================================
-- la conferma «la mia situazione non è cambiata»
-- =====================================================================
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '5 months', reddito_verificato_at = now() - interval '100 days', reddito_nucleo_verificato = 1500, situazione_confermata_at = now() - interval '100 days', professione = 'Autista', reddito_mensile = 1500 where profile_id = '11111111-0000-0000-0000-000000000006';
select t.come('11111111-0000-0000-0000-000000000006');
select conferma_situazione();
select t.torna();
select t.ok((select situazione_confermata_at > now() - interval '1 minute' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000006'), 'S73 con una verifica valida si può confermare che la situazione non è cambiata');
select t.ok((select reddito_scade_il between now() + interval '5 months' - interval '1 minute' and now() + interval '5 months' + interval '1 minute' from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000006'), 'S74 e la conferma NON allunga la scadenza (non sostituisce i documenti)');
select t.come('11111111-0000-0000-0000-000000000007');
select t.fallisce($q$select conferma_situazione()$q$, 'NIENTE_DA_CONFERMARE', 'S75 senza nessuna verifica valida non c''è niente da confermare');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce($q$select conferma_situazione()$q$, 'NIENTE_DA_CONFERMARE', 'S77a con i soli protesti validi (e nessuna verifica del reddito) non c''è niente da confermare: la conferma riguarda lavoro e reddito');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select conferma_situazione()$q$, 'NON_INQUILINO', 'S76 un proprietario non può confermare');
select t.torna();
select t.come(null);
select t.fallisce($q$select conferma_situazione()$q$, 'permission denied', 'S77 chi non ha fatto l''accesso nemmeno');
select t.torna();

-- =====================================================================
-- i PROMEMORIA: una sola volta per scadenza, solo dal server
-- =====================================================================
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '25 days', reddito_verificato_at = now(), protesti_verifica_stato = 'verificato', protesti_scade_il = now() + interval '25 days', protestato = false where profile_id = '11111111-0000-0000-0000-000000000004';
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '5 days', reddito_verificato_at = now() where profile_id = '11111111-0000-0000-0000-000000000005';
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() - interval '3 days', reddito_verificato_at = now() - interval '190 days' where profile_id = '11111111-0000-0000-0000-000000000007';
update tenant_profiles set verificato = true, verifica_stato = 'in_verifica', reddito_scade_il = now() + interval '10 days', reddito_verificato_at = now() where profile_id = '11111111-0000-0000-0000-000000000008';
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '100 days', reddito_verificato_at = now() where profile_id = '11111111-0000-0000-0000-000000000009';
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce($q$select promemoria_scadenze_verifiche()$q$, 'permission denied', 'S78 una persona non può lanciare i promemoria');
select t.torna();
select t.come(null);
select t.fallisce($q$select promemoria_scadenze_verifiche()$q$, 'permission denied', 'S79 né chi non ha fatto l''accesso');
select t.torna();
select t.come_servizio();
select t.ok((select promemoria_scadenze_verifiche()) = 4, 'S80 il server crea 4 promemoria: Dario (reddito e protesti, 30 giorni), Elena (7 giorni), Giada (scaduta); Hugo ha già mandato il rinnovo e Irene ha 100 giorni');
select t.ok((select promemoria_scadenze_verifiche()) = 0, 'S81 rilanciato subito non ne crea altri (una volta sola per scadenza)');
select t.torna();
select t.ok((select count(*) = 2 and bool_and(tipo = 'verifica_in_scadenza') from notifiche where user_id = '11111111-0000-0000-0000-000000000004'), 'S82 Dario riceve due «in scadenza» (reddito e protesti)');
select t.ok((select (dati ->> 'tipo') = 'reddito' and (dati ->> 'giorni')::int = 25 and link = '/profilo' from notifiche where user_id = '11111111-0000-0000-0000-000000000004' and dati ->> 'tipo' = 'reddito'), 'S83 con il tipo, i giorni (25) e il collegamento al profilo');
select t.ok((select count(*) = 1 and bool_and(tipo = 'verifica_in_scadenza' and (dati ->> 'giorni')::int = 5) from notifiche where user_id = '11111111-0000-0000-0000-000000000005'), 'S84 Elena (5 giorni): un «in scadenza»');
select t.ok((select count(*) = 1 and bool_and(tipo = 'verifica_scaduta' and (dati ->> 'giorni')::int = 0) from notifiche where user_id = '11111111-0000-0000-0000-000000000007'), 'S85 Giada: «scaduta»');
select t.ok((select count(*) = 0 from notifiche where user_id in ('11111111-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000009') and tipo in ('verifica_in_scadenza', 'verifica_scaduta')), 'S86 Hugo (rinnovo in corso) e Irene (100 giorni) non ricevono niente');
update tenant_profiles set reddito_scade_il = now() + interval '5 days' where profile_id = '11111111-0000-0000-0000-000000000004';
select t.come_servizio();
select t.ok((select promemoria_scadenze_verifiche()) = 1, 'S87 avvicinandosi alla scadenza (7 giorni) arriva un secondo promemoria, una volta');
select t.torna();
select t.ok((select count(*) = 3 from notifiche where user_id = '11111111-0000-0000-0000-000000000004'), 'S88 in tutto tre per Dario');
select t.fallisce($q$insert into promemoria_verifiche (tenant_id, tipo, scade_il, soglia) values ('11111111-0000-0000-0000-000000000004', 'reddito', now(), 15)$q$, 'promemoria_verifiche_soglia_check', 'S89 le soglie dei promemoria sono 30, 7 e 0');
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce($q$select * from promemoria_verifiche$q$, 'permission denied', 'S90 la tabella dei promemoria non si legge da fuori');
select t.torna();

-- =====================================================================
-- il reddito documentato solo in parte si può INTEGRARE subito (senza aspettare gli ultimi 30 giorni)
-- =====================================================================
update tenant_profiles set verificato = true, verifica_stato = 'verificato', reddito_scade_il = now() + interval '100 days', reddito_verificato_at = now(), reddito_nucleo_verificato = 1000, reddito_mensile = 2000, reddito_nucleo = 4000, professione = 'Insegnante', redditi_nucleo = 2 where profile_id = '11111111-0000-0000-0000-000000000010';
select t.come('11111111-0000-0000-0000-000000000010');
select t.doc('11111111-0000-0000-0000-000000000010', 'identita', 1, 'l-id');
select t.doc('11111111-0000-0000-0000-000000000010', 'reddito', 1, 'l-r1');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'DOCUMENTI_INQUILINO_MANCANTI', 'S91 con 1.000 € documentati su 4.000 dichiarati la verifica si può integrare anche con 100 giorni davanti, ma serve la prova di tutte le persone del nucleo');
select t.doc('11111111-0000-0000-0000-000000000010', 'reddito', 2, 'l-r2');
select richiedi_verifica_inquilino();
select t.torna();
select t.ok((select verifica_stato::text = 'in_verifica' and reddito_valido(t) from tenant_profiles t where profile_id = '11111111-0000-0000-0000-000000000010'), 'S92 l''integrazione parte e la verifica vecchia vale ancora');
select t.come('11111111-0000-0000-0000-000000000006');
select t.fallisce($q$select richiedi_verifica_inquilino()$q$, 'INQUILINO_GIA_VERIFICATO', 'S93 Franco, con tutto il reddito documentato e 5 mesi davanti, non può rinnovare');
select t.torna();

-- =====================================================================
-- lo STAFF: cosa vede
-- =====================================================================
select t.come('99999999-0000-0000-0000-000000000001');
select t.ok((select count(*) = 1 and bool_and(rinnovo) from inquilini_da_verificare() where tenant_id = '11111111-0000-0000-0000-000000000008'), 'S94 nell''elenco dello staff un rinnovo è segnato come tale');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000009');
select t.fallisce($q$select * from inquilini_da_verificare()$q$, 'NON_STAFF', 'S95 l''elenco non è per gli inquilini');
select t.fallisce($q$select * from dati_per_verifica_inquilino('11111111-0000-0000-0000-000000000002')$q$, 'NON_STAFF', 'S96 né i dati per la verifica');
select t.torna();
select t.come('99999999-0000-0000-0000-000000000001');
select t.ok((select redditi_nucleo = 2 and reddito_nucleo = 3000 and reddito_nucleo_verificato = 3100 and reddito_scade_il is not null from dati_per_verifica_inquilino('11111111-0000-0000-0000-000000000002')), 'S97 lo staff vede quanti redditi ci sono nel nucleo, quanto è dichiarato e quanto è già verificato');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000009');
select t.fallisce($q$select * from protesti_da_verificare()$q$, 'NON_STAFF', 'S98 e quello dei protesti nemmeno');
select t.torna();
select t.fallisce($q$insert into notifiche (user_id, tipo, link) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '/x')$q$, 'notifiche_tipo_check', 'S99 i tipi di notifica restano solo quelli previsti');
select t.ok((select count(*) from notifiche where tipo in ('verifica_in_scadenza', 'verifica_scaduta')) = 5, 'S100 e i due tipi nuovi sono ammessi');
select t.ok((select count(*) from t.esiti) = 101, 'S102 nessun controllo è stato saltato (ne servono 101 prima di questo)');
select 'TUTTI I CONTROLLI: ' || count(*) from t.esiti;
