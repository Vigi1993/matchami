-- ============================================================
-- MatchAmI — cancellazione dell'account
--
-- Regole decise:
--   - un INQUILINO che cancella l'account perde tutto: profilo, foto,
--     candidature, chat, contratti e le recensioni scritte su di lui.
--   - un PROPRIETARIO che cancella l'account perde tutto (annunci,
--     candidature ricevute, chat, contratti) TRANNE le recensioni che ha
--     scritto su inquilini ancora iscritti: restano, senza il suo nome.
--
-- Cosa serviva cambiare, verificato su un database vero:
--   1. `recensioni.autore_id` era NOT NULL e senza azione a cascata: un
--      proprietario che avesse scritto anche una sola recensione NON
--      poteva essere cancellato.
--   2. `messaggi.mittente_id` non aveva l'azione a cascata: chiunque
--      avesse scritto anche un solo messaggio in una chat, inquilino o
--      proprietario, NON poteva essere cancellato.
--   In entrambi i casi il database rifiutava l'operazione.
--
-- Il resto della catena era già corretto: cancellare l'utente porta via
-- profilo, annunci, candidature e contratti a cascata. I FILE
-- (foto del profilo e degli annunci) stanno nello Storage e non fanno
-- parte della catena: li toglie l'app prima della cancellazione.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Le recensioni sopravvivono all'autore
-- ------------------------------------------------------------

alter table recensioni alter column autore_id drop not null;

alter table recensioni drop constraint if exists recensioni_autore_id_fkey;
alter table recensioni
  add constraint recensioni_autore_id_fkey
  foreign key (autore_id) references owner_profiles(profile_id)
  on delete set null;

comment on column recensioni.autore_id is
  'Il proprietario che ha scritto la recensione. NULL se ha cancellato '
  'l''account: la recensione resta finché l''inquilino è iscritto.';

-- ------------------------------------------------------------
-- 2. I messaggi di chi cancella l'account
--
-- Una chat vive dentro una candidatura, che sparisce comunque quando una
-- delle due parti cancella l'account. Con il vincolo senza cascata, però,
-- il database rifiutava la cancellazione di chiunque avesse scritto.
-- ------------------------------------------------------------

alter table messaggi drop constraint if exists messaggi_mittente_id_fkey;
alter table messaggi
  add constraint messaggi_mittente_id_fkey
  foreign key (mittente_id) references profiles(id)
  on delete cascade;

-- ------------------------------------------------------------
-- 3. Gli inviti non conservano i dati di un proprietario cancellato
--
-- Un invito contiene nome ed email del proprietario, scritti
-- dall'inquilino. Se quel proprietario si iscrive e poi cancella
-- l'account, quei dati personali non devono restare.
-- ------------------------------------------------------------

create or replace function public.anonimizza_inviti_proprietario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update inviti_proprietario
     set nome_proprietario = 'Ex proprietario',
         email_proprietario = null
   where owner_id = old.profile_id;
  return old;
end;
$$;

drop trigger if exists proprietario_cancellato_anonimizza_inviti on owner_profiles;
create trigger proprietario_cancellato_anonimizza_inviti
  before delete on owner_profiles
  for each row execute function public.anonimizza_inviti_proprietario();

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select is_nullable from information_schema.columns
where table_name = 'recensioni' and column_name = 'autore_id';

select conname, confdeltype from pg_constraint
where conname in ('recensioni_autore_id_fkey', 'messaggi_mittente_id_fkey')
order by conname;   -- n = SET NULL, c = CASCADE

select tgname from pg_trigger
where tgname = 'proprietario_cancellato_anonimizza_inviti';
