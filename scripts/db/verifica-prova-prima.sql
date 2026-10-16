-- Dati PRIMA della 0037 (database con le migrazioni fino alla 0036): case in tutti gli stati, alcune verificate A MANO senza nessuna prova.
\set ON_ERROR_STOP on
\set QUIET on
create schema t;
insert into auth.users (id, email, raw_user_meta_data) values
 ('66666666-0000-0000-0000-00000000000a', 'o@x.it', '{"ruolo":"proprietario","nome":"Mario","privacy_accettata":true}'),
 ('66666666-0000-0000-0000-00000000000b', 'o2@x.it', '{"ruolo":"proprietario","nome":"Luisa","privacy_accettata":true}'),
 ('66666666-0000-0000-0000-0000000000f1', 's@x.it', '{"ruolo":"proprietario","nome":"Staff","privacy_accettata":true}');
insert into staff (user_id) values ('66666666-0000-0000-0000-0000000000f1');
-- A: verificata a mano, nessuna prova | B: verificata con la sua prova | C: da verificare | D: in verifica, nessuna prova | E: verificata, con solo l'identità e la prova di un'ALTRA casa
insert into listings (id, owner_id, titolo, zona, prezzo, pubblicato, verifica_stato, verificato_at) values
 ('bbbbbbbb-0000-0000-0000-00000000000a', '66666666-0000-0000-0000-00000000000a', 'A senza prova', 'Isola', 1000, true, 'verificato', '2026-09-01T10:00:00Z'),
 ('bbbbbbbb-0000-0000-0000-00000000000b', '66666666-0000-0000-0000-00000000000a', 'B con prova', 'Isola', 1100, true, 'verificato', '2026-09-02T10:00:00Z'),
 ('bbbbbbbb-0000-0000-0000-00000000000c', '66666666-0000-0000-0000-00000000000a', 'C da verificare', 'Isola', 1200, true, 'non_avviata', null),
 ('bbbbbbbb-0000-0000-0000-00000000000d', '66666666-0000-0000-0000-00000000000b', 'D in verifica', 'Isola', 1300, true, 'in_verifica', null),
 ('bbbbbbbb-0000-0000-0000-00000000000e', '66666666-0000-0000-0000-00000000000b', 'E con la prova di un altra', 'Isola', 1400, true, 'verificato', '2026-09-03T10:00:00Z');
insert into documenti_verifica (owner_id, listing_id, tipo, percorso, nome_file) values
 ('66666666-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b', 'proprieta', '66666666-0000-0000-0000-00000000000a/proprieta-b.pdf', 'visura-b.pdf'),
 ('66666666-0000-0000-0000-00000000000b', null, 'identita', '66666666-0000-0000-0000-00000000000b/identita.pdf', 'carta.pdf'),
 ('66666666-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000d', 'proprieta', '66666666-0000-0000-0000-00000000000b/proprieta-d.pdf', 'visura-d.pdf');
do $$ begin
  if (select count(*) from listings where verifica_stato = 'verificato') <> 3 then raise exception 'PRIMA: dovevano esserci 3 case verificate'; end if;
  raise notice 'OK: prima della 0037 ci sono case verificate senza nessuna prova (A ed E)';
end $$;
