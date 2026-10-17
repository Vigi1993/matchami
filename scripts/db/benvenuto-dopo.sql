-- Dopo la 0039: chi era già iscritto è «completato»; i nuovi no; si completa solo con la funzione e con i dati essenziali.
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
grant execute on all functions in schema t to anon, authenticated;
create function t.utente(id uuid, email text, ruolo text, nome text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (id, email, jsonb_build_object('ruolo', ruolo, 'nome', nome, 'cognome', 'Prova', 'privacy_accettata', true));
$$;
create function t.fatto(u uuid) returns boolean language sql as $$ select onboarding_completato from profiles where id = u $$;

-- ---- chi era già iscritto ----
select t.ok(t.fatto('aaaa0000-0000-0000-0000-000000000001') and t.fatto('aaaa0000-0000-0000-0000-000000000002'), 'B1 chi era già iscritto (inquilino e proprietario) risulta «completato»: non rifà il percorso');

-- ---- i nuovi iscritti ----
select t.utente('bbbb0000-0000-0000-0000-000000000001', 'n1@x.it', 'inquilino', 'Anna');
select t.utente('bbbb0000-0000-0000-0000-000000000002', 'n2@x.it', 'inquilino', 'Bruno');
select t.utente('bbbb0000-0000-0000-0000-000000000003', 'n3@x.it', 'proprietario', 'Carla');
select t.utente('bbbb0000-0000-0000-0000-000000000004', 'n4@x.it', 'proprietario', 'Dario');
select t.utente('99999999-0000-0000-0000-000000000001', 's1@x.it', 'proprietario', 'Staff');
insert into staff (user_id) values ('99999999-0000-0000-0000-000000000001');
select t.ok(not t.fatto('bbbb0000-0000-0000-0000-000000000001') and not t.fatto('bbbb0000-0000-0000-0000-000000000003'), 'B2 un nuovo iscritto parte «non completato»');

-- ---- nessuno la scrive a mano ----
select t.come('bbbb0000-0000-0000-0000-000000000001');
select t.fallisce($q$update profiles set onboarding_completato = true where id = 'bbbb0000-0000-0000-0000-000000000001'$q$, 'ONBOARDING_RISERVATO', 'B3 l''inquilino non può segnarsi «completato» da solo');
update profiles set nome = 'Annalisa' where id = 'bbbb0000-0000-0000-0000-000000000001';
select t.ok((select nome from profiles where id = 'bbbb0000-0000-0000-0000-000000000001') = 'Annalisa', 'B4 il resto del profilo si modifica come prima');
select t.torna();

-- ---- inquilino: cosa serve ----
select t.come('bbbb0000-0000-0000-0000-000000000001');
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_LAVORO_MANCANTE', 'B5 senza la situazione lavorativa non si completa');
update tenant_profiles set professione = '   ' where profile_id = 'bbbb0000-0000-0000-0000-000000000001';
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_LAVORO_MANCANTE', 'B6 una situazione lavorativa fatta di spazi non vale');
update tenant_profiles set professione = 'Dipendente' where profile_id = 'bbbb0000-0000-0000-0000-000000000001';
select t.fallisce($q$select completa_onboarding()$q$, 'PROTESTI_NON_DICHIARATI', 'B7 senza aver risposto sui protesti non si completa');
update tenant_profiles set protestato = false where profile_id = 'bbbb0000-0000-0000-0000-000000000001';
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_BUDGET_MANCANTE', 'B8 senza un budget massimo non si completa');
update tenant_profiles set budget_max = 0 where profile_id = 'bbbb0000-0000-0000-0000-000000000001';
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_BUDGET_MANCANTE', 'B9 un budget di zero nemmeno');
update tenant_profiles set budget_max = 1200 where profile_id = 'bbbb0000-0000-0000-0000-000000000001';
select t.ok(not t.fatto('bbbb0000-0000-0000-0000-000000000001'), 'B10 finora non risulta completato (gli errori non cambiano niente)');
select completa_onboarding();
select t.torna();
select t.ok(t.fatto('bbbb0000-0000-0000-0000-000000000001'), 'B11 con lavoro, protesti e budget il benvenuto si completa');
select t.come('bbbb0000-0000-0000-0000-000000000001');
select completa_onboarding();
select t.ok(true, 'B12 rifarlo non dà errore (è già fatto)');
select t.torna();
select t.ok(not t.fatto('bbbb0000-0000-0000-0000-000000000002'), 'B13 completare il proprio non completa quello di un altro');

-- ---- proprietario: cosa serve ----
select t.come('bbbb0000-0000-0000-0000-000000000003');
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_NESSUN_IMMOBILE', 'B14 senza nessun immobile il proprietario non completa');
select t.torna();
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato) values ('cccccccc-0000-0000-0000-0000000000d4', 'bbbb0000-0000-0000-0000-000000000004', 'Casa di Dario', 'Isola', 900, true);
select t.come('bbbb0000-0000-0000-0000-000000000003');
select t.fallisce($q$select completa_onboarding()$q$, 'ONBOARDING_NESSUN_IMMOBILE', 'B15 l''immobile di un altro proprietario non conta');
select t.torna();
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato) values ('cccccccc-0000-0000-0000-0000000000c3', 'bbbb0000-0000-0000-0000-000000000003', 'Casa non pubblicata', 'Isola', 900, false);
select t.come('bbbb0000-0000-0000-0000-000000000003');
select completa_onboarding();
select t.torna();
select t.ok(t.fatto('bbbb0000-0000-0000-0000-000000000003'), 'B16 con un immobile suo (anche non pubblicato e da verificare) il proprietario completa: foto, documenti e verifiche si fanno dopo');

-- ---- staff e anonimo ----
select t.come('99999999-0000-0000-0000-000000000001');
select completa_onboarding();
select t.torna();
select t.ok(t.fatto('99999999-0000-0000-0000-000000000001'), 'B17 lo staff non ha dati da compilare: completa senza controlli');
select t.come(null);
select t.fallisce($q$select completa_onboarding()$q$, 'permission denied', 'B18 chi non ha fatto l''accesso non può chiamare la funzione');
select t.torna();

-- ---- la migrazione rieseguita non rifà il segno a chi si è iscritto dopo ----
select t.utente('bbbb0000-0000-0000-0000-000000000009', 'n9@x.it', 'inquilino', 'Ultimo');
select t.ok(not t.fatto('bbbb0000-0000-0000-0000-000000000009'), 'B19 un nuovo iscritto dopo la migrazione parte «non completato»');

-- ---- nessuno nasce già «completato» ----
select t.utente('bbbb0000-0000-0000-0000-00000000000a', 'na@x.it', 'inquilino', 'Nuova');
delete from profiles where id = 'bbbb0000-0000-0000-0000-00000000000a';
select t.come('bbbb0000-0000-0000-0000-00000000000a');
insert into profiles (id, ruolo, nome, onboarding_completato, privacy_accettata) values ('bbbb0000-0000-0000-0000-00000000000a', 'inquilino', 'Nuova', true, true);
select t.torna();
select t.ok(not t.fatto('bbbb0000-0000-0000-0000-00000000000a'), 'B20 anche chi inserisce da sé il proprio profilo con «completato = sì» nasce «non completato»');
