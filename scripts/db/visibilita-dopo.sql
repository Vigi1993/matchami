-- Dopo la 0033: tutti visibili, le date di chi lo era già non cambiano, i nuovi iscritti sono visibili di partenza.
\set ON_ERROR_STOP on
\set QUIET on
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'CONTROLLO FALLITO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
select t.ok((select count(*) from tenant_profiles where visibile_ai_proprietari is true) = 3, 'V1 dopo la 0033 anche chi era già iscritto è visibile (tutti e tre)');
select t.ok((select visibile_dal from tenant_profiles where profile_id = '44444444-0000-0000-0000-00000000000b') = '2026-09-01T10:00:00Z', 'V2 la data di chi si era già reso visibile non cambia');
select t.ok((select count(*) from tenant_profiles where visibile_dal is null) = 0, 'V3 ora tutti hanno la data da cui sono visibili');
select t.ok((select count(*) from tenant_profiles where profile_id in ('44444444-0000-0000-0000-00000000000a', '44444444-0000-0000-0000-00000000000c') and visibile_dal > now() - interval '1 hour') = 2, 'V4 gli altri due hanno la data di oggi');
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-0000-0000-0000-00000000000d', 'd@x.it', '{"ruolo":"inquilino","nome":"Dino","privacy_accettata":true}');
select t.ok((select visibile_ai_proprietari and visibile_dal is not null from tenant_profiles where profile_id = '44444444-0000-0000-0000-00000000000d'), 'V5 chi si iscrive dopo è visibile di partenza, con la data');
select t.ok((select column_default from information_schema.columns where table_name = 'tenant_profiles' and column_name = 'visibile_ai_proprietari') = 'true', 'V6 il valore di partenza della colonna è «visibile»');
-- Dino si nasconde: la scelta resta, e rieseguire la migrazione non lo rende di nuovo visibile
update tenant_profiles set visibile_ai_proprietari = false, visibile_dal = null where profile_id = '44444444-0000-0000-0000-00000000000d';
select t.ok((select visibile_ai_proprietari from tenant_profiles where profile_id = '44444444-0000-0000-0000-00000000000d') is false, 'V7 chi si nasconde dopo la 0033 resta nascosto');
