-- Dati PRIMA della 0039 (database con le migrazioni fino alla 0038): iscritti «vecchi» di entrambi i ruoli, tutti con onboarding_completato = false (come l'app non l'ha mai usato).
\set ON_ERROR_STOP on
\set QUIET on
create schema t;
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaa0000-0000-0000-0000-000000000001', 'vecchio-inq@x.it', '{"ruolo":"inquilino","nome":"Vecchio","privacy_accettata":true}'),
 ('aaaa0000-0000-0000-0000-000000000002', 'vecchio-prop@x.it', '{"ruolo":"proprietario","nome":"Vecchia","privacy_accettata":true}');
do $$ begin
  if (select count(*) from profiles where onboarding_completato = false) <> 2 then raise exception 'PRIMA: i due iscritti vecchi dovevano risultare «non completato»'; end if;
  raise notice 'OK: prima della 0039 gli iscritti esistenti risultano tutti «non completato»';
end $$;
