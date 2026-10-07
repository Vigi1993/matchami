-- ============================================================
-- MatchAmI — notifiche dentro l'app
--
-- Fin qui nessuno veniva avvisato di niente: l'esito di una verifica, una
-- candidatura ricevuta, la risposta a una candidatura. Bisognava tornare a
-- controllare. Ora ogni evento che interessa a una persona crea una
-- notifica, che si legge nella pagina «Novità» e si segnala con un numero.
--
-- COME NASCONO. Con trigger sul database, non con il codice dell'app: gli
-- eventi passano da punti diversi (una decisione dello staff, una candidatura,
-- la conferma di un affitto da un link) e un trigger non si può dimenticare.
-- Una notifica che non riesce a nascere NON deve far fallire l'azione
-- principale: l'errore viene registrato e basta.
--
-- COSA CONTIENE. Il tipo e, al massimo, il titolo di un annuncio. Mai nomi
-- di persone: non si duplicano dati personali in una tabella in più.
--
-- CHI LE VEDE. Solo il destinatario. Nessun utente può crearne, modificarne
-- o cancellarne: le segna come lette con una funzione.
--
-- Le email (stesso evento, altro canale) sono un passo successivo.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La tabella
-- ------------------------------------------------------------

create table if not exists notifiche (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  tipo text not null check (tipo in (
    'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata',
    'immobile_verificato', 'immobile_respinto',
    'reddito_verificato', 'reddito_respinto',
    'affitto_verificato', 'affitto_respinto',
    'rapporto_confermato', 'rapporto_rifiutato',
    'feedback_ricevuto'
  )),
  dati jsonb not null default '{}'::jsonb check (pg_column_size(dati) < 2000),
  -- un percorso INTERNO dell'app: mai un indirizzo esterno
  link text not null check (link ~ '^/[A-Za-z0-9/_-]*$' and length(link) <= 120),
  letta_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifiche_utente_idx on notifiche (user_id, created_at desc);
create index if not exists notifiche_non_lette_idx on notifiche (user_id) where letta_at is null;

alter table notifiche enable row level security;

-- Le legge solo il destinatario. Nessuna policy di scrittura.
drop policy if exists "notifiche: le legge il destinatario" on notifiche;
create policy "notifiche: le legge il destinatario" on notifiche
  for select using (user_id = auth.uid());

revoke insert, update, delete on notifiche from authenticated, anon;

-- ------------------------------------------------------------
-- 2. Creare una notifica (solo dai trigger qui sotto)
--
-- Non è chiamabile da nessun utente: altrimenti chiunque potrebbe
-- riempire di messaggi un'altra persona. Se non riesce, avvisa nel registro
-- del database e lascia andare avanti l'azione principale.
-- ------------------------------------------------------------

create or replace function public.crea_notifica(
  p_user uuid,
  p_tipo text,
  p_dati jsonb,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;

  begin
    insert into notifiche (user_id, tipo, dati, link)
    values (p_user, p_tipo, coalesce(p_dati, '{}'::jsonb), p_link);
  exception when others then
    raise warning 'notifica non creata (%): %', p_tipo, sqlerrm;
  end;
end;
$$;

revoke all on function public.crea_notifica(uuid, text, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Segnare come lette
-- ------------------------------------------------------------

create or replace function public.segna_notifiche_lette(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  -- p_ids nullo = tutte le proprie non lette. Gli id di altri non fanno
  -- niente: la condizione su user_id le esclude.
  update notifiche
     set letta_at = now()
   where user_id = auth.uid()
     and letta_at is null
     and (p_ids is null or id = any(p_ids));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.segna_notifiche_lette(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 4. I trigger: un evento, una notifica
-- ------------------------------------------------------------

-- 4.1 Una candidatura arriva al proprietario dell'annuncio
create or replace function public.notifica_candidatura_ricevuta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings;
begin
  select * into l from listings where id = new.listing_id;
  perform public.crea_notifica(l.owner_id, 'candidatura_ricevuta',
    jsonb_build_object('titolo', left(l.titolo, 80)), '/database');
  return new;
end;
$$;

drop trigger if exists notifica_candidatura_ricevuta on candidature;
create trigger notifica_candidatura_ricevuta
  after insert on candidature
  for each row execute function public.notifica_candidatura_ricevuta();

-- 4.2 Il proprietario decide: lo sa l'inquilino
create or replace function public.notifica_candidatura_decisa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings;
begin
  select * into l from listings where id = new.listing_id;
  if new.status = 'accettata' then
    perform public.crea_notifica(new.tenant_id, 'candidatura_accettata',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/chat/' || new.id::text);
  elsif new.status = 'rifiutata' then
    perform public.crea_notifica(new.tenant_id, 'candidatura_rifiutata',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/candidature');
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_candidatura_decisa on candidature;
create trigger notifica_candidatura_decisa
  after update of status on candidature
  for each row
  when (old.status is distinct from new.status)
  execute function public.notifica_candidatura_decisa();

-- 4.3 Lo staff decide su un immobile
create or replace function public.notifica_immobile_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verifica_stato = 'in_verifica' and new.verifica_stato = 'verificato' then
    perform public.crea_notifica(new.owner_id, 'immobile_verificato',
      jsonb_build_object('titolo', left(new.titolo, 80)), '/');
  elsif old.verifica_stato = 'in_verifica' and new.verifica_stato = 'non_avviata' then
    perform public.crea_notifica(new.owner_id, 'immobile_respinto',
      jsonb_build_object('titolo', left(new.titolo, 80)), '/');
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_immobile_esito on listings;
create trigger notifica_immobile_esito
  after update of verifica_stato on listings
  for each row
  when (old.verifica_stato is distinct from new.verifica_stato)
  execute function public.notifica_immobile_esito();

-- 4.4 Lo staff decide sul reddito di un inquilino.
-- Solo da «in verifica»: se la verifica decade perché la persona ha
-- cambiato i propri dati, lo sa già, non serve avvisarla.
create or replace function public.notifica_reddito_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verifica_stato = 'in_verifica' and new.verifica_stato = 'verificato' then
    perform public.crea_notifica(new.profile_id, 'reddito_verificato', '{}'::jsonb, '/profilo');
  elsif old.verifica_stato = 'in_verifica' and new.verifica_stato = 'non_avviata' then
    perform public.crea_notifica(new.profile_id, 'reddito_respinto', '{}'::jsonb, '/profilo');
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_reddito_esito on tenant_profiles;
create trigger notifica_reddito_esito
  after update of verifica_stato on tenant_profiles
  for each row
  when (old.verifica_stato is distinct from new.verifica_stato)
  execute function public.notifica_reddito_esito();

-- 4.5 Lo staff decide su un affitto: lo sanno entrambe le parti
create or replace function public.notifica_affitto_esito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  if old.stato = 'da_verificare' and new.stato = 'verificato' then
    v_tipo := 'affitto_verificato';
  elsif old.stato = 'da_verificare' and new.stato = 'respinto' then
    v_tipo := 'affitto_respinto';
  else
    return new;
  end if;

  perform public.crea_notifica(new.owner_id, v_tipo, '{}'::jsonb, '/gestione-affitti');
  perform public.crea_notifica(new.tenant_id, v_tipo, '{}'::jsonb, '/profilo');
  return new;
end;
$$;

drop trigger if exists notifica_affitto_esito on rapporti_locazione;
create trigger notifica_affitto_esito
  after update of stato on rapporti_locazione
  for each row
  when (old.stato is distinct from new.stato)
  execute function public.notifica_affitto_esito();

-- 4.6 L'altra persona risponde a un affitto dichiarato: lo sa chi l'ha dichiarato
create or replace function public.notifica_rapporto_risposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
begin
  v_link := case when new.ruolo_creatore = 'proprietario' then '/gestione-affitti' else '/profilo' end;
  if old.stato = 'in_attesa' and new.stato = 'confermata' then
    perform public.crea_notifica(new.creato_da, 'rapporto_confermato', '{}'::jsonb, v_link);
  elsif old.stato = 'in_attesa' and new.stato = 'rifiutata' then
    perform public.crea_notifica(new.creato_da, 'rapporto_rifiutato', '{}'::jsonb, v_link);
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_rapporto_risposta on richieste_rapporto;
create trigger notifica_rapporto_risposta
  after update of stato on richieste_rapporto
  for each row
  when (old.stato is distinct from new.stato)
  execute function public.notifica_rapporto_risposta();

-- 4.7 Un proprietario lascia un feedback: lo sa l'inquilino
create or replace function public.notifica_feedback_ricevuto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crea_notifica(new.tenant_id, 'feedback_ricevuto', '{}'::jsonb, '/profilo');
  return new;
end;
$$;

drop trigger if exists notifica_feedback_ricevuto on recensioni;
create trigger notifica_feedback_ricevuto
  after insert on recensioni
  for each row execute function public.notifica_feedback_ricevuto();

-- Le funzioni dei trigger non servono a nessun utente
revoke all on function
  public.notifica_candidatura_ricevuta(), public.notifica_candidatura_decisa(),
  public.notifica_immobile_esito(), public.notifica_reddito_esito(),
  public.notifica_affitto_esito(), public.notifica_rapporto_risposta(),
  public.notifica_feedback_ricevuto()
from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Pulizia
--
-- Le notifiche non si accumulano per sempre: quelle già lette dopo 60 giorni
-- e qualunque dopo 180. Non la può chiamare nessun utente: serve a chi
-- gestisce il sistema (un lavoro periodico, in un passo successivo).
-- ------------------------------------------------------------

create or replace function public.pulisci_notifiche()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from notifiche
   where (letta_at is not null and letta_at < now() - interval '60 days')
      or created_at < now() - interval '180 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.pulisci_notifiche() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select count(*) as trigger_di_notifica
from pg_trigger where tgname like 'notifica\_%' and not tgisinternal;   -- 7

select routine_name from information_schema.routines
where routine_name in ('crea_notifica', 'segna_notifiche_lette', 'pulisci_notifiche')
order by 1;   -- 3 righe

-- deve risultare 0: nessuna policy di scrittura sulle notifiche
select count(*) as policy_di_scrittura_rimaste
from pg_policy where polrelid = 'notifiche'::regclass and polcmd in ('a', 'w', 'd');
