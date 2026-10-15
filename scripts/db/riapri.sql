-- ============================================================
-- Prova della migrazione 0034 (annullare un match o uno scarto) su un PostgreSQL vero.
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
-- quante righe modifica un'istruzione (con la sicurezza a livello di riga)
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
select t.utente('11111111-0000-0000-0000-000000000001', 't1@x.it', 'inquilino', 'Anna');
select t.utente('11111111-0000-0000-0000-000000000002', 't2@x.it', 'inquilino', 'Bruno');
select t.utente('11111111-0000-0000-0000-000000000003', 't3@x.it', 'inquilino', 'Carla');
select t.utente('11111111-0000-0000-0000-000000000005', 't5@x.it', 'inquilino', 'Elena');
select t.utente('22222222-0000-0000-0000-000000000001', 'o1@x.it', 'proprietario', 'Mario');
select t.utente('22222222-0000-0000-0000-000000000002', 'o2@x.it', 'proprietario', 'Luisa');
update tenant_profiles set professione = 'Designer' where profile_id = '11111111-0000-0000-0000-000000000001';
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato, verifica_stato) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Bilocale luminoso', 'Isola, Milano', 1250, true, 'verificato'),
 ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Trilocale del sole', 'Navigli, Milano', 1500, true, 'verificato');

-- tre candidature a Bilocale: Anna, Bruno, Carla (si candidano da sole, con i loro permessi)
select t.come('11111111-0000-0000-0000-000000000001');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000002');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000003');
insert into candidature (id, listing_id, tenant_id) values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003');
select t.torna();

-- ---- Mario accetta Anna (match) ----
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000001', 'accettata', null, '{"match":{"punteggio":80}}'::jsonb);
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'accettata', 'A01 Mario fa match con Anna');
select t.ok((select count(*) from valutazioni_candidati where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 1, 'A02 la valutazione si registra alla decisione');
select t.come('11111111-0000-0000-0000-000000000001');
insert into messaggi (candidatura_id, mittente_id, testo) values ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Buongiorno!');
select t.torna();
select t.ok((select count(*) from messaggi where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 1, 'A03 la chat del match funziona');

-- ---- chi può annullare e chi no ----
select t.come('22222222-0000-0000-0000-000000000002');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'CANDIDATURA_NON_TUA', 'A04 un altro proprietario non può annullare');
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'CANDIDATURA_NON_TUA', 'A05 nemmeno l''inquilino può annullare il match');
select t.torna();
select t.come(null);
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'permission denied', 'A06 chi non ha fatto l''accesso non può annullare niente');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('99999999-0000-0000-0000-000000000009')$q$, 'CANDIDATURA_NON_TUA', 'A07 una candidatura che non esiste: lo stesso errore (non si capisce se esiste)');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000002')$q$, 'NON_DECISA', 'A08 una candidatura ancora in attesa non ha niente da annullare');
select t.torna();
update candidature set status = 'ritirata' where id = 'cccccccc-0000-0000-0000-000000000003';
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000003')$q$, 'NON_DECISA', 'A09 una candidatura ritirata dall''inquilino non si riapre');
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'accettata', 'A10 e il match di Anna è ancora lì');

-- ---- il blocco: un contratto o una visita in programma ----
insert into contratti (candidatura_id) values ('cccccccc-0000-0000-0000-000000000001');
create temp table prima as select count(*) as n from notifiche where tipo = 'candidatura_riaperta'; grant select on prima to public;
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'HA_UN_CONTRATTO', 'A11 con un contratto il match non si annulla');
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'accettata' and (select count(*) from notifiche where tipo = 'candidatura_riaperta') = (select n from prima), 'A12 e non cambia niente: né lo stato né le notifiche');
delete from contratti where candidatura_id = 'cccccccc-0000-0000-0000-000000000001';
insert into visite (listing_id, candidatura_id, data_ora, stato) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', now() + interval '3 days', 'confermata');
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'HA_UNA_VISITA', 'A13 con una visita CONFERMATA in programma non si annulla');
select t.torna();
update visite set stato = 'proposta' where candidatura_id = 'cccccccc-0000-0000-0000-000000000001';
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'HA_UNA_VISITA', 'A14 e nemmeno con una visita solo PROPOSTA');
select t.torna();
update visite set stato = 'rifiutata' where candidatura_id = 'cccccccc-0000-0000-0000-000000000001';
update visite set stato = 'confermata', data_ora = now() - interval '2 days' where false;
-- una visita rifiutata, e una già passata, non bloccano
insert into visite (listing_id, candidatura_id, data_ora, stato) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', now() - interval '2 days', 'confermata');

-- ---- annullare il match ----
select t.come('22222222-0000-0000-0000-000000000001');
select riapri_candidatura('cccccccc-0000-0000-0000-000000000001');
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'in_attesa' and (select motivo_rifiuto from candidature where id = 'cccccccc-0000-0000-0000-000000000001') is null, 'A15 una visita rifiutata o già passata non blocca: il match si annulla e la candidatura torna «in attesa»');
select t.ok((select count(*) from valutazioni_candidati where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 0, 'A16 la valutazione registrata si cancella');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'candidatura_riaperta' and link = '/candidature' and dati->>'titolo' = 'Bilocale luminoso') = 1, 'A17 Anna riceve UNA notifica «candidatura riaperta», con il titolo');
select t.ok((select count(*) from notifiche where user_id = '22222222-0000-0000-0000-000000000001' and tipo in ('candidatura_ricevuta', 'candidatura_riaperta')) = 3, 'A18 il proprietario riceve solo le tre notifiche delle candidature vere (nessuna in più)');
select t.ok((select count(*) from messaggi where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 1, 'A19 i messaggi restano');
select t.come('11111111-0000-0000-0000-000000000001');
select t.fallisce($q$insert into messaggi (candidatura_id, mittente_id, testo) values ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'ci siete?')$q$, 'row-level security', 'A20 ma la chat è chiusa finché non si rifà il match');
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'in_attesa', 'A21 Anna vede la sua candidatura «in attesa»');
select t.torna();
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura('cccccccc-0000-0000-0000-000000000001')$q$, 'NON_DECISA', 'A22 annullare due volte non si può (ora è in attesa)');
select t.torna();

-- ---- si può rifare: scarto, annulla lo scarto, match ----
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000001', 'rifiutata', 'altro_candidato', '{"match":{"punteggio":10}}'::jsonb);
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'rifiutata' and (select motivo_rifiuto from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'altro_candidato', 'A23 dopo l''annullamento si può decidere di nuovo (qui: scarto, con il motivo)');
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok((select professione from candidati_del_proprietario where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') is null, 'A24 dopo lo scarto il proprietario non vede più i dati dell''inquilino (solo il nome)');
select riapri_candidatura('cccccccc-0000-0000-0000-000000000001');
select t.ok((select professione from candidati_del_proprietario where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 'Designer', 'A25 annullando lo scarto i dati tornano visibili');
select t.torna();
select t.ok((select status::text from candidature where id = 'cccccccc-0000-0000-0000-000000000001') = 'in_attesa' and (select motivo_rifiuto from candidature where id = 'cccccccc-0000-0000-0000-000000000001') is null and (select count(*) from valutazioni_candidati where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 0, 'A26 lo scarto annullato: di nuovo «in attesa», senza motivo e senza valutazione');
select t.ok((select count(*) from notifiche where user_id = '11111111-0000-0000-0000-000000000001' and tipo = 'candidatura_riaperta') = 2, 'A27 ad ogni annullamento l''inquilino è avvisato');
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000001', 'accettata', null, '{"match":{"punteggio":99}}'::jsonb);
select t.torna();
select t.ok((select valutazione->'match'->>'punteggio' from valutazioni_candidati where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = '99', 'A28 e la nuova valutazione è quella NUOVA (non quella vecchia rimasta)');
select t.come('11111111-0000-0000-0000-000000000001');
insert into messaggi (candidatura_id, mittente_id, testo) values ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'eccomi di nuovo');
select t.ok((select count(*) from messaggi where candidatura_id = 'cccccccc-0000-0000-0000-000000000001') = 2, 'A29 rifatto il match la chat si riapre, con i messaggi di prima');
select t.torna();

-- ---- nessuna scorciatoia ----
select t.come('22222222-0000-0000-0000-000000000001');
select t.ok(t.righe($q$update candidature set status = 'in_attesa' where id = 'cccccccc-0000-0000-0000-000000000001'$q$) = 0, 'A30 il proprietario non può riportare una candidatura «in attesa» a mano (nessuna riga si muove)');
select set_config('matchami.riapertura', 'on', false);
select t.ok(t.righe($q$update candidature set status = 'in_attesa' where id = 'cccccccc-0000-0000-0000-000000000001'$q$) = 0, 'A31 nemmeno alzando il segnale a mano (il permesso manca comunque)');
select set_config('matchami.riapertura', 'off', false);
select t.torna();
select t.come('11111111-0000-0000-0000-000000000001');
select t.ok(t.righe($q$update candidature set status = 'in_attesa' where id = 'cccccccc-0000-0000-0000-000000000001'$q$) = 0 and t.righe($q$update candidature set status = 'ritirata' where id = 'cccccccc-0000-0000-0000-000000000001'$q$) = 0, 'A32 e nemmeno l''inquilino cambia a mano la sua candidatura decisa');
select t.torna();
select t.fallisce($q$update candidature set status = 'in_attesa' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'DECISIONE_DEFINITIVA', 'A33 il trigger blocca la riapertura senza il segnale (anche a chi può scrivere ovunque)');
select t.fallisce($q$update candidature set status = 'rifiutata' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'DECISIONE_DEFINITIVA', 'A34 e blocca match -> scarto senza passare dall''annullamento');
select set_config('matchami.riapertura', 'on', false);
select t.fallisce($q$update candidature set status = 'rifiutata' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'DECISIONE_DEFINITIVA', 'A35 col segnale alzato l''UNICO passaggio ammesso è verso «in attesa»: match -> scarto no');
select t.fallisce($q$update candidature set status = 'ritirata' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'DECISIONE_DEFINITIVA', 'A36 né match -> ritirata');
select set_config('matchami.riapertura', 'off', false);

-- ---- un match nato da una richiesta del proprietario ----
update tenant_profiles set visibile_ai_proprietari = true where profile_id = '11111111-0000-0000-0000-000000000005';
select t.come('22222222-0000-0000-0000-000000000001');
create temp table rq as select invia_richiesta_proprietario('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000005', null) as id; grant select on rq to public;
select t.torna();
select t.come('11111111-0000-0000-0000-000000000005');
create temp table cq as select rispondi_richiesta_proprietario((select id from rq), true) as id; grant select on cq to public;
select t.torna();
select t.ok((select origine from candidature where id = (select id from cq)) = 'proprietario' and (select status::text from candidature where id = (select id from cq)) = 'accettata', 'A37 Elena ha accettato la richiesta: match con origine «proprietario»');
select t.come('22222222-0000-0000-0000-000000000001');
select riapri_candidatura((select id from cq));
select t.torna();
select t.ok((select status::text from candidature where id = (select id from cq)) = 'in_attesa' and (select origine from candidature where id = (select id from cq)) = 'proprietario', 'A38 si può annullare anche questo match: torna in attesa e ricorda l''origine');
select t.ok((select stato from richieste_proprietari where id = (select id from rq)) = 'accettata', 'A39 la richiesta resta «accettata» (non si può rimandare la stessa richiesta)');

-- ---- vincoli ----
select t.fallisce($q$insert into notifiche (user_id, tipo, link) values ('11111111-0000-0000-0000-000000000001', 'tipo_inventato', '/x')$q$, 'notifiche_tipo_check', 'A40 i tipi di notifica restano solo quelli noti');
select t.ok((select count(*) from notifiche where tipo = 'candidatura_riaperta') = 3, 'A41 il tipo nuovo è ammesso');
select t.come('22222222-0000-0000-0000-000000000001');
select t.fallisce($q$select riapri_candidatura(null)$q$, 'CANDIDATURA_NON_TUA', 'A42 senza identificativo nemmeno');
select t.torna();
-- ---- il segnale si spegne: nella STESSA transazione un'altra riapertura a mano non passa ----
select t.come('22222222-0000-0000-0000-000000000001');
select decidi_candidatura('cccccccc-0000-0000-0000-000000000002', 'accettata', null, '{"match":{"punteggio":50}}'::jsonb);
select t.torna();
do $$
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000001', false);
  perform riapri_candidatura('cccccccc-0000-0000-0000-000000000001');
  perform t.fallisce($q$update candidature set status = 'in_attesa' where id = 'cccccccc-0000-0000-0000-000000000002'$q$, 'DECISIONE_DEFINITIVA',
    'A43 finita una riapertura il segnale è spento: nella stessa transazione un''altra decisione non si riapre a mano');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
select t.ok((select count(*) from t.esiti) = 43, 'A44 nessun controllo è stato saltato (ne servono 43 prima di questo)');
select 'TUTTI I CONTROLLI: ' || count(*) from t.esiti;
