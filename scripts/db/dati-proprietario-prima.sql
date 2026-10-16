-- Dati PRIMA della 0036 (database con le migrazioni fino alla 0035): un proprietario con i tre dati compilati.
\set ON_ERROR_STOP on
\set QUIET on
create schema t;
insert into auth.users (id, email, raw_user_meta_data) values
 ('55555555-0000-0000-0000-00000000000a', 'a@x.it', '{"ruolo":"proprietario","nome":"Mario","privacy_accettata":true}'),
 ('55555555-0000-0000-0000-00000000000b', 'b@x.it', '{"ruolo":"inquilino","nome":"Anna","privacy_accettata":true}');
update owner_profiles set proprietario_tipo = 'agenzia', num_immobili = 5, obiettivo = 'Massima selezione inquilini' where profile_id = '55555555-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from information_schema.columns where table_name = 'owner_profiles' and column_name in ('proprietario_tipo', 'num_immobili', 'obiettivo')) <> 3 then raise exception 'PRIMA: le tre colonne dovevano esserci'; end if;
  if (select proprietario_tipo::text from owner_profiles where profile_id = '55555555-0000-0000-0000-00000000000a') <> 'agenzia' then raise exception 'PRIMA: il tipo non si è salvato'; end if;
  raise notice 'OK: prima della 0036 le tre colonne ci sono e hanno dei dati';
end $$;
