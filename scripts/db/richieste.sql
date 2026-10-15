-- ============================================================
-- Prova della migrazione 0032 (richieste dei proprietari) su un PostgreSQL vero.
-- Si lancia da test-db-richieste.mjs, su un database con lo stub di Supabase e TUTTE le migrazioni già applicate.
-- Ogni controllo scrive «OK n: ...» o ferma tutto con un errore.
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
-- esegue un'istruzione e si aspetta un errore che contenga il codice dato
create function t.fallisce(sql text, codice text, msg text) returns void language plpgsql as $$
declare e text;
begin
  begin
    execute sql;
  exception when others then e := sqlerrm;
  end;
  if e is null then raise exception 'CONTROLLO FALLITO (nessun errore): %', msg; end if;
  if position(codice in e) = 0 then raise exception 'CONTROLLO FALLITO (errore diverso: %): %', e, msg; end if;
  insert into t.esiti (testo) values (msg);
  raise notice 'OK: %', msg;
end $$;
-- si diventa un utente (o nessuno) come farebbe l'API
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

-- ---- i personaggi ----
create function t.utente(id uuid, email text, ruolo text, nome text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (id, email, jsonb_build_object('ruolo', ruolo, 'nome', nome, 'privacy_accettata', true));
$$;
select t.utente('11111111-0000-0000-0000-000000000001', 't1@x.it', 'inquilino', 'Anna');
select t.utente('11111111-0000-0000-0000-000000000002', 't2@x.it', 'inquilino', 'Bruno');
select t.utente('11111111-0000-0000-0000-000000000003', 't3@x.it', 'inquilino', 'Carla');
select t.utente('11111111-0000-0000-0000-000000000004', 't4@x.it', 'inquilino', 'Dario');
select t.utente('22222222-0000-0000-0000-000000000001', 'o1@x.it', 'proprietario', 'Mario');
select t.utente('22222222-0000-0000-0000-000000000002', 'o2@x.it', 'proprietario', 'Luisa');

insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato, verifica_stato) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Bilocale luminoso', 'Isola, Milano', 1250, true, 'verificato'),
 ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Trilocale del sole', 'Navigli, Milano', 1500, true, 'verificato'),
 ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'Monolocale non pubblicato', 'Isola, Milano', 800, false, 'verificato'),
 ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001', 'Casa in verifica', 'Isola, Milano', 900, true, 'in_verifica');

select t.ok((select count(*) from tenant_profiles where visibile_ai_proprietari is true) = 4, '01 chi si iscrive come inquilino è VISIBILE ai proprietari di partenza (tutti e quattro)');
select t.ok((select count(*) from tenant_profiles where visibile_dal is not null) = 4, '02 e c''è la data da cui lo è');
select t.ok((select origine from candidature limit 1) is null, '03a (nessuna candidatura ancora)');

-- Bruno (t2) si nasconde: gli altri restano visibili come di partenza. Si nasconde da solo, con i suoi permessi.
select t.come('11111111-0000-0000-0000-000000000002');
update tenant_profiles set visibile_ai_proprietari = false, visibile_dal = null where profile_id = '11111111-0000-0000-0000-000000000002';
select t.torna();
select t.ok((select visibile_ai_proprietari from tenant_profiles where profile_id = '11111111-0000-0000-0000-000000000002') is false, '03b Bruno può nascondersi da solo, con i suoi permessi');
select t.ok((select count(*) from tenant_profiles where visibile_ai_proprietari is true) = 3, '03c gli altri tre restano visibili');

-- ---- chi può e chi non può mandare una richiesta ----
select t.come(null);
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', null)$q$, 'permission denied', '04 chi non ha fatto l''accesso non può mandare una richiesta');
select t.torna();

select t.come('11111111-0000-0000-0000-000000000002');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', null)$q$, 'NON_TUO_IMMOBILE', '05 un inquilino non può mandare richieste (non è il proprietario della casa)');
select t.torna();

select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', null)$q$, 'NON_TUO_IMMOBILE', '06 un proprietario non può scrivere per la casa di un altro');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', null)$q$, 'IMMOBILE_NON_PUBBLICATO', '07 per una casa non pubblicata no');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', null)$q$, 'IMMOBILE_NON_PUBBLICATO', '08 per una casa in verifica no');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', null)$q$, 'INQUILINO_NON_DISPONIBILE', '09 a chi si è nascosto no');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000009', null)$q$, 'INQUILINO_NON_DISPONIBILE', '10 a una persona che non esiste: lo stesso errore (non si capisce se esiste)');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', repeat('a', 281))$q$, 'MESSAGGIO_TROPPO_LUNGO', '11 un messaggio di 281 caratteri no');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', null)$q$, 'INQUILINO_NON_DISPONIBILE', '12 a un altro proprietario no (non è un inquilino)');
select t.torna();

-- ---- una richiesta che va a buon fine ----
select t.come('22222222-0000-0000-0000-000000000001');
create temp table r1 as select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '  Ciao Anna, la casa ti piacerà!  ') as id;
grant select on r1 to public;
select t.torna();
select t.ok((select count(*) from richieste_proprietari) = 1, '13 la richiesta è stata creata');
select t.ok((select stato from richieste_proprietari) = 'inviata' and (select risposta_at from richieste_proprietari) is null, '14 parte «inviata», senza risposta');
select t.ok((select messaggio from richieste_proprietari) = 'Ciao Anna, la casa ti piacerà!', '15 il messaggio si ripulisce dagli spazi');
select t.ok((select nome_proprietario from richieste_proprietari) = 'Mario', '16 si ricorda il nome di battesimo del proprietario');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'richiesta_ricevuta' and link = '/candidature' and dati->>'nome' = 'Mario' and dati->>'titolo' = 'Bilocale luminoso') = 1, '17 l''inquilino riceve UNA notifica, con il nome e la casa');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001') = 0, '18 il proprietario non riceve niente');

select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', null)$q$, 'RICHIESTA_GIA_INVIATA', '19 non si scrive due volte alla stessa persona per la stessa casa');
select t.torna();
update richieste_proprietari set messaggio = null where false;  -- nessun effetto, solo per chiarezza

-- un messaggio fatto di soli spazi vale «nessun messaggio»
select t.come('22222222-0000-0000-0000-000000000001');
select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', '    ');
select t.torna();
select t.ok((select messaggio from richieste_proprietari where tenant_id = '11111111-0000-0000-0000-000000000004') is null, '20 un messaggio di soli spazi diventa «nessun messaggio»');

-- chi si è già candidato non si contatta
select t.come('11111111-0000-0000-0000-000000000003');
insert into candidature (listing_id, tenant_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003');
select t.torna();
select t.ok((select origine from candidature where tenant_id = '11111111-0000-0000-0000-000000000003') = 'inquilino', '21 una candidatura normale ha origine «inquilino»');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo = 'candidatura_ricevuta') = 1, '22 una candidatura normale avvisa ANCORA il proprietario (niente è cambiato)');
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', null)$q$, 'GIA_CANDIDATO', '23 a chi si è già candidato a quella casa no');
select t.torna();

-- ---- chi vede cosa (sicurezza a livello di riga) ----
select t.come('11111111-0000-0000-0000-000000000001');
select t.ok((select count(*) from richieste_proprietari) = 1, '24 Anna vede la SUA richiesta e solo quella');
select t.fallisce($q$insert into richieste_proprietari (listing_id, owner_id, tenant_id) values ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001')$q$, 'permission denied', '25 un inquilino non può scrivere richieste a mano');
select t.fallisce($q$update richieste_proprietari set stato = 'accettata', risposta_at = now()$q$, 'permission denied', '26 un inquilino non può cambiare una richiesta a mano (si passa dalla funzione)');
select t.fallisce($q$delete from richieste_proprietari$q$, 'permission denied', '27 un inquilino non può cancellare le richieste');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000002');
select t.ok((select count(*) from richieste_proprietari) = 0, '28 Bruno (a cui nessuno ha scritto) non vede richieste');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select count(*) from richieste_proprietari) = 2, '29 Mario vede le sue due richieste');
select t.fallisce($q$insert into richieste_proprietari (listing_id, owner_id, tenant_id) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002')$q$, 'permission denied', '30 un proprietario non può scrivere richieste a mano (salterebbe il consenso)');
select t.fallisce($q$update richieste_proprietari set stato = 'accettata', risposta_at = now()$q$, 'permission denied', '31 un proprietario non può accettare al posto dell''inquilino');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000002');
select t.ok((select count(*) from richieste_proprietari) = 0, '32 Luisa (un altro proprietario) non vede le richieste di Mario');
select t.torna();
select t.come(null);
select t.fallisce($q$select count(*) from richieste_proprietari$q$, 'permission denied', '33 chi non ha fatto l''accesso non legge niente');
select t.torna();

-- ---- rispondere ----
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, true)', (select id from r1)), 'RICHIESTA_NON_TUA', '34 un''altra persona non può rispondere alla richiesta di Anna');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, true)', (select id from r1)), 'RICHIESTA_NON_TUA', '35 il proprietario non può rispondere al posto dell''inquilino');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, null)', (select id from r1)), 'RISPOSTA_NON_VALIDA', '36 una risposta vuota non vale come un rifiuto');
select t.ok((select stato from richieste_proprietari where id = (select id from r1)) = 'inviata', '37 la richiesta è ancora in attesa');
select t.torna();

-- Anna ACCETTA
select t.come('11111111-0000-0000-0000-000000000001');
create temp table c1 as select rispondi_richiesta_proprietario((select id from r1), true) as id;
grant select on c1 to public;
select t.torna();
select t.ok((select id from c1) is not null, '38 accettando si riceve l''identificativo della candidatura');
select t.ok((select count(*) from candidature where id = (select id from c1) and status = 'accettata' and origine = 'proprietario' and tenant_id = '11111111-0000-0000-0000-000000000001' and listing_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, '39 nasce una candidatura GIÀ ACCETTATA, di origine «proprietario»');
select t.ok((select stato from richieste_proprietari where id = (select id from r1)) = 'accettata' and (select candidatura_id from richieste_proprietari where id = (select id from r1)) = (select id from c1) and (select risposta_at from richieste_proprietari where id = (select id from r1)) is not null, '40 la richiesta diventa «accettata», con la candidatura e la data');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo = 'richiesta_accettata' and link = '/chat/' || (select id from c1)::text and dati->>'titolo' = 'Bilocale luminoso') = 1, '41 il proprietario riceve UNA notifica «richiesta accettata», con il link alla chat');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo = 'candidatura_ricevuta') = 1, '42 e NON una finta «nuova candidatura» (ne resta una sola, quella di Carla)');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'candidatura_accettata') = 0, '43 l''inquilino non riceve un finto «il proprietario ha accettato la tua candidatura»');
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, false)', (select id from r1)), 'RICHIESTA_GIA_RISPOSTA', '44 non si risponde due volte');
select t.torna();

-- la chat funziona come per ogni match
select t.come('11111111-0000-0000-0000-000000000001');
insert into messaggi (candidatura_id, mittente_id, testo) values ((select id from c1), '11111111-0000-0000-0000-000000000001', 'Grazie, mi piace!');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
insert into messaggi (candidatura_id, mittente_id, testo) values ((select id from c1), '22222222-0000-0000-0000-000000000001', 'Quando vuoi vederla?');
select t.ok((select count(*) from messaggi where candidatura_id = (select id from c1)) = 2, '45 la chat si apre: l''inquilino e il proprietario si scrivono');
select t.ok((select count(*) from candidati_del_proprietario where candidatura_id = (select id from c1)) = 1, '46 il proprietario vede l''inquilino tra i candidati, come per ogni match');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce(format('insert into messaggi (candidatura_id, mittente_id, testo) values (%L, %L, ''intruso'')', (select id from c1), '11111111-0000-0000-0000-000000000004'), 'row-level security', '47 un estraneo non entra nella chat');
select t.torna();

-- ---- Dario RIFIUTA ----
create temp table nprima as select count(*) as n from notifiche where user_id = '22222222-0000-0000-0000-000000000001';
grant select on nprima to public;
select t.come('11111111-0000-0000-0000-000000000004');
create temp table rd as select id from richieste_proprietari where tenant_id = '11111111-0000-0000-0000-000000000004';
grant select on rd to public;
select t.ok((select rispondi_richiesta_proprietario((select id from rd), false)) is null, '48 rifiutando non nasce nessuna candidatura');
select t.torna();
select t.ok((select stato from richieste_proprietari where tenant_id = '11111111-0000-0000-0000-000000000004') = 'rifiutata' and (select risposta_at from richieste_proprietari where tenant_id = '11111111-0000-0000-0000-000000000004') is not null, '49 la richiesta diventa «rifiutata»');
select t.ok((select count(*) from candidature where tenant_id = '11111111-0000-0000-0000-000000000004') = 0, '50 e Dario non risulta candidato');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001') = (select n from nprima), '51 il proprietario non riceve nessuna notifica per un rifiuto (nessuna pressione)');
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', null)$q$, 'RICHIESTA_GIA_INVIATA', '52 dopo un rifiuto non si può insistere per la stessa casa');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000004');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, true)', (select id from rd)), 'RICHIESTA_GIA_RISPOSTA', '53 e Dario non può cambiare idea dopo aver rifiutato (deve candidarsi lui)');
select t.torna();

-- ---- il consenso si può ritirare ----
update tenant_profiles set visibile_ai_proprietari = false where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('22222222-0000-0000-0000-000000000002');
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', null)$q$, 'INQUILINO_NON_DISPONIBILE', '54 chi si nasconde dopo non si può più contattare');
select t.torna();

-- ---- la casa non c'è più al momento della risposta ----
update tenant_profiles set visibile_ai_proprietari = true where profile_id = '11111111-0000-0000-0000-000000000003';
select t.come('22222222-0000-0000-0000-000000000002');
create temp table rl as select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', null) as id;
grant select on rl to public;
select t.torna();
update listings set pubblicato = false where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select t.come('11111111-0000-0000-0000-000000000003');
select t.fallisce(format('select rispondi_richiesta_proprietario(%L, true)', (select id from rl)), 'IMMOBILE_NON_DISPONIBILE', '55 se la casa non è più pubblicata non si può accettare');
select t.torna();
select t.ok((select stato from richieste_proprietari where id = (select id from rl)) = 'inviata' and (select count(*) from candidature where listing_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0, '56 e non cambia niente: la richiesta resta in attesa, nessuna candidatura');
select t.come('11111111-0000-0000-0000-000000000003');
select t.ok((select rispondi_richiesta_proprietario((select id from rl), false)) is null, '57 ma si può sempre rifiutare');
select t.torna();

-- ---- il freno: venti richieste in un giorno ----
do $$
declare i int; u uuid;
begin
  for i in 1..21 loop
    u := ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, email, raw_user_meta_data) values (u, 'x' || i || '@x.it', '{"ruolo":"inquilino","nome":"Prova","privacy_accettata":true}');
    update tenant_profiles set visibile_ai_proprietari = true where profile_id = u;
  end loop;
end $$;
update listings set pubblicato = true where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select t.come('22222222-0000-0000-0000-000000000002');
do $$
declare i int;
begin
  -- Luisa ha già mandato 1 richiesta (a Carla): ne restano 19
  for i in 1..19 loop
    perform invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, null);
  end loop;
end $$;
select t.fallisce($q$select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000020', null)$q$, 'TROPPE_RICHIESTE', '58 dopo venti richieste in un giorno ci si ferma');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok(invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000021', null) is not null, '59 il freno è per proprietario: un altro può scrivere');
select t.torna();
update richieste_proprietari set created_at = now() - interval '2 days' where owner_id = '22222222-0000-0000-0000-000000000002';
select t.come('22222222-0000-0000-0000-000000000002');
select t.ok(invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000020', null) is not null, '60 il giorno dopo si può di nuovo');
select t.torna();

-- ---- vincoli e pulizia ----
select t.fallisce($q$update candidature set origine = 'altro' where false or true$q$, 'candidature_origine_valida', '61 l''origine di una candidatura può essere solo «inquilino» o «proprietario»');
select t.fallisce($q$insert into notifiche (user_id, tipo, link) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '/x')$q$, 'notifiche_tipo_check', '62 i tipi di notifica sono solo quelli noti');
select t.ok((select count(*) from notifiche where tipo in ('richiesta_ricevuta', 'richiesta_accettata')) > 0, '63 i due tipi nuovi di notifica sono ammessi');
select t.fallisce($q$insert into richieste_proprietari (listing_id, owner_id, tenant_id, stato) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'accettata')$q$, 'richieste_proprietari_check', '64 una richiesta «accettata» deve avere la data della risposta');
select t.fallisce($q$insert into richieste_proprietari (listing_id, owner_id, tenant_id, stato, risposta_at) values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'inventato', now())$q$, 'richieste_proprietari_stato_check', '65 gli stati sono solo inviata, accettata, rifiutata');
delete from auth.users where id = '11111111-0000-0000-0000-000000000001';
select t.ok((select count(*) from richieste_proprietari where tenant_id = '11111111-0000-0000-0000-000000000001') = 0, '66 cancellando un account spariscono le sue richieste');
delete from listings where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select count(*) from richieste_proprietari where listing_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, '67 cancellando una casa spariscono le sue richieste');
select t.ok((select count(*) from t.esiti) = 69, '70 nessun controllo è stato saltato (ne servono 69 prima di questo)');
select 'TUTTI I CONTROLLI: ' || count(*) from t.esiti;
