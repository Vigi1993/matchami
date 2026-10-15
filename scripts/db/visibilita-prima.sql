-- Dati PRIMA della 0033 (database con le migrazioni fino alla 0032): tre inquilini già iscritti, nei tre stati possibili.
\set ON_ERROR_STOP on
\set QUIET on
create schema t;
create table t.dati (chiave text primary key, valore text);
insert into auth.users (id, email, raw_user_meta_data) values
 ('44444444-0000-0000-0000-00000000000a', 'a@x.it', '{"ruolo":"inquilino","nome":"Alba","privacy_accettata":true}'),
 ('44444444-0000-0000-0000-00000000000b', 'b@x.it', '{"ruolo":"inquilino","nome":"Berto","privacy_accettata":true}'),
 ('44444444-0000-0000-0000-00000000000c', 'c@x.it', '{"ruolo":"inquilino","nome":"Cleo","privacy_accettata":true}');
-- A: non ha mai toccato niente (era spento), B: lo aveva acceso (con la sua data), C: lo aveva acceso e poi ritirato
update tenant_profiles set visibile_ai_proprietari = true, visibile_dal = '2026-09-01T10:00:00Z' where profile_id = '44444444-0000-0000-0000-00000000000b';
update tenant_profiles set visibile_ai_proprietari = false, visibile_dal = null where profile_id in ('44444444-0000-0000-0000-00000000000a', '44444444-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from tenant_profiles where visibile_ai_proprietari is true) <> 1 then raise exception 'PRIMA: ne aspettavo uno solo visibile'; end if;
  raise notice 'OK: prima della 0033 solo Berto è visibile';
end $$;
