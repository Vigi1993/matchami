-- Dopo la 0036: le tre colonne e il tipo non ci sono più; il proprietario c'è ancora; i nuovi proprietari si creano come prima.
\set ON_ERROR_STOP on
\set QUIET on
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'CONTROLLO FALLITO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
select t.ok((select count(*) from information_schema.columns where table_name = 'owner_profiles' and column_name in ('proprietario_tipo', 'num_immobili', 'obiettivo')) = 0, 'D1 le tre colonne non ci sono più');
select t.ok((select count(*) from pg_type where typname = 'tipo_proprietario') = 0, 'D2 e nemmeno il loro tipo');
select t.ok((select array_agg(column_name::text order by column_name) from information_schema.columns where table_name = 'owner_profiles') = array['profile_id', 'updated_at'], 'D3 la tabella ha solo ciò che serve: l''identificativo e la data di aggiornamento');
select t.ok((select count(*) from owner_profiles where profile_id = '55555555-0000-0000-0000-00000000000a') = 1, 'D4 il proprietario che aveva i dati c''è ancora (si perdono solo i tre valori)');
insert into auth.users (id, email, raw_user_meta_data) values ('55555555-0000-0000-0000-00000000000c', 'c@x.it', '{"ruolo":"proprietario","nome":"Luisa","privacy_accettata":true}');
select t.ok((select count(*) from owner_profiles where profile_id = '55555555-0000-0000-0000-00000000000c') = 1, 'D5 chi si iscrive come proprietario dopo la 0036 ottiene il suo profilo come prima');
select t.ok((select count(*) from tenant_profiles where profile_id = '55555555-0000-0000-0000-00000000000b') = 1 and (select count(*) from owner_profiles where profile_id = '55555555-0000-0000-0000-00000000000b') = 0, 'D6 un inquilino non diventa proprietario');
insert into listings (id, owner_id, titolo, zona, prezzo) values ('aaaaaaaa-0000-0000-0000-000000000099', '55555555-0000-0000-0000-00000000000a', 'Casa di prova', 'Milano', 900);
select t.ok((select count(*) from listings where owner_id = '55555555-0000-0000-0000-00000000000a') = 1, 'D7 un proprietario può ancora avere i suoi immobili');
