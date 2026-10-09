-- ============================================================
-- MatchAmI — email per le notifiche
--
-- Fin qui le notifiche stanno solo dentro l'app: chi non la apre non vede
-- niente. Ora un invio periodico manda un'email con le novità non lette.
--
-- LE REGOLE, che servono a non essere un fastidio:
--   - UN solo messaggio riassuntivo per persona, non uno per notifica, e al
--     massimo uno all'ora: se arrivano cinque novità, è una sola email (fino a
--     20; il resto va al giro dopo);
--   - niente email per ciò che si è già letto nell'app, né per notifiche più
--     vecchie di 48 ore;
--   - si può disattivare, dall'app o con un clic dal link in ogni email, senza
--     accedere;
--   - le notifiche GIÀ esistenti quando si attiva non generano email: il primo
--     invio non deve sommergere nessuno di cose già viste.
--
-- PRIVACY. Gli indirizzi email non si copiano da nessuna parte: l'invio li legge
-- dall'account al momento di mandare. Il registro degli invii conserva SOLO data,
-- esito e quante notifiche erano (nessun contenuto, nessun indirizzo), per 90
-- giorni. Finché il fornitore di email è PROVVISORIO le email non partono: si
-- salva una copia di prova (solo testo, 7 giorni), leggibile dallo staff.
--
-- Le funzioni dell'invio le chiama SOLO il ruolo di servizio: nessun utente.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Le notifiche ricordano se è partita l'email
--
-- Le notifiche che ESISTONO già al momento dell'attivazione si segnano come
-- già inviate, UNA volta sola (se la colonna c'è già, non si tocca niente: una
-- migrazione rilanciata non deve cancellare le notifiche che aspettano).
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifiche' and column_name = 'email_inviata_at'
  ) then
    alter table notifiche add column email_inviata_at timestamptz;
    update notifiche set email_inviata_at = now();
  end if;
end;
$$;

alter table notifiche add column if not exists email_tentativi smallint not null default 0;

create index if not exists notifiche_email_da_inviare_idx
  on notifiche (user_id, created_at)
  where email_inviata_at is null and letta_at is null;

-- ------------------------------------------------------------
-- 2. Le preferenze: attive per impostazione predefinita, con un codice per
--    disattivare senza accedere
-- ------------------------------------------------------------

create table if not exists preferenze_email (
  user_id         uuid primary key references profiles(id) on delete cascade,
  attive          boolean not null default true,
  -- 64 caratteri esadecimali casuali: serve a disattivare con un clic dal link
  -- nell'email, senza accedere. Chi lo conosce può solo disattivare, nient'altro.
  token           text not null unique
                  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ultima_email_at timestamptz,
  aggiornate_at   timestamptz not null default now()
);

alter table preferenze_email enable row level security;
revoke all on preferenze_email from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Il registro degli invii: solo data, esito e quante, mai il contenuto
-- ------------------------------------------------------------

create table if not exists registro_email (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  fornitore   text not null check (char_length(fornitore) between 1 and 40),
  esito       text not null check (esito in ('inviata', 'fallita')),
  n_notifiche smallint not null check (n_notifiche between 0 and 100),
  errore      text check (errore is null or char_length(errore) <= 300),
  created_at  timestamptz not null default now()
);

alter table registro_email enable row level security;
revoke all on registro_email from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Le copie di prova: ciò che il fornitore PROVVISORIO scrive al posto di
--    mandare l'email. Solo testo, per 7 giorni.
-- ------------------------------------------------------------

create table if not exists email_di_prova (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  oggetto    text not null check (char_length(oggetto) between 1 and 200),
  testo      text not null check (char_length(testo) between 1 and 20000),
  created_at timestamptz not null default now()
);

alter table email_di_prova enable row level security;
revoke all on email_di_prova from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Le preferenze, per la persona
-- ------------------------------------------------------------

-- Senza una riga le email sono attive.
create or replace function public.preferenze_email_mie()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.attive from preferenze_email p where p.user_id = auth.uid()), true);
$$;

create or replace function public.imposta_email_notifiche(p_attive boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  if p_attive is null then
    raise exception 'VALORE_NON_VALIDO';
  end if;

  insert into preferenze_email (user_id, attive)
  values (auth.uid(), p_attive)
  on conflict (user_id) do update set attive = excluded.attive, aggiornate_at = now();
end;
$$;

-- ------------------------------------------------------------
-- 6. L'invio (solo il ruolo di servizio)
--
-- RECLAMA le notifiche da mandare: le sceglie, le segna come inviate e le
-- restituisce raggruppate per persona. Segnarle SUBITO, nella stessa istruzione,
-- è ciò che impedisce che due invii lanciati insieme mandino due volte la
-- stessa notifica. Se poi l'email non parte, `annulla_invio_email` le rimette in
-- coda.
--
-- Le condizioni sulle notifiche stanno DENTRO la selezione che le blocca
-- (`for update skip locked`): così, se un altro invio le ha appena segnate, la
-- condizione si ricontrolla sulla riga nuova e queste si scartano.
-- ------------------------------------------------------------

create or replace function public.reclama_notifiche_email(p_max_utenti integer default 50)
returns table (
  user_id uuid,
  email text,
  nome text,
  token text,
  notifiche jsonb
)
language sql
volatile
security definer
set search_path = public
as $$
  with utenti as (
    select n.user_id
      from notifiche n
      join auth.users u on u.id = n.user_id
                        and u.email is not null
                        and u.email_confirmed_at is not null
      left join preferenze_email p on p.user_id = n.user_id
     where n.email_inviata_at is null
       and n.email_tentativi < 3
       and n.letta_at is null
       and n.created_at > now() - interval '48 hours'
       and coalesce(p.attive, true)
       and (p.ultima_email_at is null or p.ultima_email_at <= now() - interval '1 hour')
     group by n.user_id
     order by min(n.created_at)
     limit least(greatest(coalesce(p_max_utenti, 50), 1), 200)
  ),
  candidate as (
    select n.id,
           row_number() over (partition by n.user_id order by n.created_at) as pos
      from notifiche n
      join utenti on utenti.user_id = n.user_id
     where n.email_inviata_at is null
       and n.email_tentativi < 3
       and n.letta_at is null
       and n.created_at > now() - interval '48 hours'
  ),
  bloccate as (
    select n.id
      from notifiche n
     where n.id in (select c.id from candidate c where c.pos <= 20)
       and n.email_inviata_at is null
       and n.email_tentativi < 3
       and n.letta_at is null
       for update of n skip locked
  ),
  marcate as (
    update notifiche n
       set email_inviata_at = now()
      from bloccate b
     where n.id = b.id
       and n.email_inviata_at is null
    returning n.id, n.user_id, n.tipo, n.dati, n.link, n.created_at
  ),
  preferenze as (
    insert into preferenze_email (user_id, ultima_email_at)
    select distinct m.user_id, now() from marcate m
    on conflict (user_id) do update set ultima_email_at = now()
    returning preferenze_email.user_id, preferenze_email.token
  )
  select m.user_id,
         u.email::text,
         pr.nome,
         pf.token,
         jsonb_agg(
           jsonb_build_object('id', m.id, 'tipo', m.tipo, 'dati', m.dati, 'link', m.link, 'created_at', m.created_at)
           order by m.created_at
         )
    from marcate m
    join auth.users u on u.id = m.user_id
    join profiles pr on pr.id = m.user_id
    join preferenze pf on pf.user_id = m.user_id
   group by m.user_id, u.email, pr.nome, pf.token;
$$;

-- Se l'email non è partita: le notifiche tornano in coda (con un tentativo in
-- più, al massimo 3). Un errore DEFINITIVO (un indirizzo che non esiste) le
-- esclude subito. Chi riprova lo fa dopo un'ora, per le regole dell'invio.
create or replace function public.annulla_invio_email(p_notifiche uuid[], p_definitivo boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update notifiche
     set email_inviata_at = null,
         email_tentativi = case when p_definitivo then 3 else least(email_tentativi + 1, 3) end
   where id = any(coalesce(p_notifiche, '{}'::uuid[]))
     and email_inviata_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.registra_esito_email(
  p_user uuid,
  p_fornitore text,
  p_esito text,
  p_n integer,
  p_errore text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_esito not in ('inviata', 'fallita') then
    raise exception 'ESITO_NON_VALIDO';
  end if;

  insert into registro_email (user_id, fornitore, esito, n_notifiche, errore)
  values (p_user, left(p_fornitore, 40), p_esito, least(greatest(p_n, 0), 100), left(p_errore, 300));

  delete from registro_email where created_at < now() - interval '90 days';
end;
$$;

create or replace function public.deposita_email_di_prova(p_user uuid, p_oggetto text, p_testo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into email_di_prova (user_id, oggetto, testo)
  values (p_user, left(p_oggetto, 200), left(p_testo, 20000));

  delete from email_di_prova where created_at < now() - interval '7 days';
end;
$$;

-- Disattiva con il codice dell'email. Restituisce se il codice esisteva; un
-- codice che non ha la forma giusta non arriva nemmeno alla tabella.
create or replace function public.disiscrivi_email(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update preferenze_email set attive = false, aggiornate_at = now() where token = p_token;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ------------------------------------------------------------
-- 7. Lo staff vede le copie di prova e il registro
-- ------------------------------------------------------------

create or replace function public.email_di_prova_staff()
returns table (id uuid, user_id uuid, oggetto text, testo text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.user_id, e.oggetto, e.testo, e.created_at
    from email_di_prova e
   where public.is_staff()
   order by e.created_at desc
   limit 50;
$$;

create or replace function public.registro_email_staff()
returns table (id uuid, user_id uuid, fornitore text, esito text, n_notifiche smallint, errore text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, r.fornitore, r.esito, r.n_notifiche, r.errore, r.created_at
    from registro_email r
   where public.is_staff()
   order by r.created_at desc
   limit 100;
$$;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

-- Per le persone
revoke all on function public.preferenze_email_mie(), public.imposta_email_notifiche(boolean) from public, anon;
grant execute on function public.preferenze_email_mie(), public.imposta_email_notifiche(boolean) to authenticated;

-- Per lo staff (la funzione stessa controlla che lo sia)
revoke all on function public.email_di_prova_staff(), public.registro_email_staff() from public, anon;
grant execute on function public.email_di_prova_staff(), public.registro_email_staff() to authenticated;

-- Per l'invio: SOLO il ruolo di servizio
revoke all on function
  public.reclama_notifiche_email(integer),
  public.annulla_invio_email(uuid[], boolean),
  public.registra_esito_email(uuid, text, text, integer, text),
  public.deposita_email_di_prova(uuid, text, text),
  public.disiscrivi_email(text)
from public, anon, authenticated;

grant execute on function
  public.reclama_notifiche_email(integer),
  public.annulla_invio_email(uuid[], boolean),
  public.registra_esito_email(uuid, text, text, integer, text),
  public.deposita_email_di_prova(uuid, text, text),
  public.disiscrivi_email(text)
to service_role;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('preferenze_email_mie', 'imposta_email_notifiche', 'reclama_notifiche_email',
                       'annulla_invio_email', 'registra_esito_email', 'deposita_email_di_prova',
                       'disiscrivi_email', 'email_di_prova_staff', 'registro_email_staff')
order by 1;   -- 9 righe

-- devono risultare 0: nessun permesso diretto sulle tre tabelle nuove
select count(*) as permessi_diretti_per_gli_utenti
from information_schema.role_table_grants
where table_name in ('preferenze_email', 'registro_email', 'email_di_prova')
  and grantee in ('authenticated', 'anon');

-- deve risultare 0: le notifiche già esistenti non generano email
select count(*) as notifiche_in_attesa_di_email from notifiche where email_inviata_at is null;
