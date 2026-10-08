-- ============================================================
-- MatchAmI — visite: disponibilità e prenotazione
--
-- La tabella `visite` esisteva dalla prima migrazione e nessuna schermata la
-- usava. Le sue regole di accesso avevano due difetti, che nessuno aveva
-- visto proprio perché nessuno la usava:
--   - «visite: tenant books» lasciava all'inquilino il permesso di modificare
--     QUALUNQUE colonna della sua visita (la data, l'annuncio, lo stato),
--     senza alcun controllo sul risultato;
--   - «visite: owner manages slots» era `ALL` senza controlli: il proprietario
--     poteva agganciare una visita alla candidatura di un ALTRO annuncio.
-- Si tolgono entrambe: le scritture passano solo da funzioni che controllano
-- ogni cosa.
--
-- COME FUNZIONA
--   - il proprietario aggiunge posti liberi per un suo immobile (data e ora);
--   - un inquilino con una candidatura ACCETTATA su quell'immobile ne
--     prenota uno; a ogni match, una visita alla volta;
--   - si può annullare finché la visita non è passata. Se annulla l'inquilino
--     il posto torna libero; se annulla il proprietario la visita risulta
--     annullata e l'inquilino lo sa;
--   - ogni prenotazione o annullamento avvisa l'altra parte.
--
-- GLI STATI (l'enumerato esiste già, non si tocca)
--   proposta   = posto libero, offerto dal proprietario
--   confermata = prenotato da un inquilino
--   rifiutata  = annullata dal proprietario (resta, così l'inquilino lo vede)
--   completata = non assegnata a nessuno dall'app: una visita passata si
--                riconosce dalla data, senza spostare lo stato
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Niente scritture dirette
-- ------------------------------------------------------------

drop policy if exists "visite: owner manages slots" on visite;
drop policy if exists "visite: tenant books" on visite;
revoke insert, update, delete on visite from authenticated, anon;

-- ------------------------------------------------------------
-- 2. Indici
-- ------------------------------------------------------------

-- Due posti identici sullo stesso immobile non hanno senso (la funzione impedisce
-- anche quelli troppo vicini: questo è l'ultimo argine).
create unique index if not exists visite_slot_unico
  on visite (listing_id, data_ora)
  where stato <> 'rifiutata';

create index if not exists visite_candidatura_idx on visite (candidatura_id);
create index if not exists visite_immobile_data_idx on visite (listing_id, data_ora);

-- ------------------------------------------------------------
-- 3. Coerenza: se la candidatura sparisce (account cancellato), una visita
--    confermata non resta agganciata a nessuno
-- ------------------------------------------------------------

create or replace function public.visite_coerenza()
returns trigger
language plpgsql
as $$
begin
  if new.candidatura_id is null
     and old.candidatura_id is not null
     and new.stato = 'confermata' then
    new.stato := case when new.data_ora > now() then 'proposta' else 'completata' end;
  end if;
  return new;
end;
$$;

drop trigger if exists visite_coerenza on visite;
create trigger visite_coerenza
  before update on visite
  for each row execute function public.visite_coerenza();

-- ------------------------------------------------------------
-- 4. Il proprietario aggiunge e toglie posti liberi
-- ------------------------------------------------------------

create or replace function public.crea_slot_visita(p_listing uuid, p_data_ora timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quando timestamptz;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if not exists (select 1 from listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'IMMOBILE_NON_TUO';
  end if;

  if p_data_ora is null then
    raise exception 'DATA_NON_VALIDA';
  end if;

  -- al minuto: i secondi non servono a nessuno
  v_quando := date_trunc('minute', p_data_ora);

  if v_quando < now() + interval '1 hour' then
    raise exception 'DATA_TROPPO_VICINA';
  end if;
  if v_quando > now() + interval '90 days' then
    raise exception 'DATA_TROPPO_LONTANA';
  end if;

  if (select count(*) from visite
       where listing_id = p_listing and stato = 'proposta'
         and candidatura_id is null and data_ora > now()) >= 30 then
    raise exception 'TROPPI_POSTI';
  end if;

  -- una visita occupa tempo: due sullo stesso immobile distano almeno 30 minuti
  if exists (
    select 1 from visite
     where listing_id = p_listing and stato <> 'rifiutata'
       and abs(extract(epoch from (data_ora - v_quando))) < 1800
  ) then
    raise exception 'POSTO_TROPPO_VICINO';
  end if;

  insert into visite (listing_id, data_ora) values (p_listing, v_quando)
  returning id into v_id;
  return v_id;
end;
$$;

-- Solo un posto ancora libero. Uno già prenotato si annulla con annulla_visita,
-- che avvisa l'inquilino.
create or replace function public.elimina_posto_visita(p_visita uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_libero boolean;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select (v.candidatura_id is null and v.stato = 'proposta') into v_libero
    from visite v join listings l on l.id = v.listing_id
   where v.id = p_visita and l.owner_id = auth.uid();

  if v_libero is null then
    raise exception 'VISITA_NON_TUA';
  end if;
  if not v_libero then
    raise exception 'VISITA_PRENOTATA';
  end if;

  delete from visite where id = p_visita and candidatura_id is null and stato = 'proposta';
end;
$$;

-- ------------------------------------------------------------
-- 5. L'inquilino prenota
--
-- Solo da una candidatura SUA e ACCETTATA, su un posto libero dello stesso
-- immobile, con almeno mezz'ora di margine, e una sola visita alla volta per
-- match. L'aggiornamento è condizionato: se due persone prenotano lo stesso
-- posto nello stesso istante, ne vince una sola.
-- ------------------------------------------------------------

create or replace function public.prenota_visita(p_visita uuid, p_candidatura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c candidature;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_c from candidature where id = p_candidatura and tenant_id = auth.uid();
  if not found then
    raise exception 'CANDIDATURA_NON_TUA';
  end if;
  if v_c.status <> 'accettata' then
    raise exception 'CANDIDATURA_NON_ACCETTATA';
  end if;

  if exists (
    select 1 from visite
     where candidatura_id = p_candidatura and stato = 'confermata' and data_ora > now()
  ) then
    raise exception 'VISITA_GIA_PRENOTATA';
  end if;

  update visite
     set candidatura_id = p_candidatura, stato = 'confermata'
   where id = p_visita
     and listing_id = v_c.listing_id
     and candidatura_id is null
     and stato = 'proposta'
     and data_ora > now() + interval '30 minutes';

  if not found then
    -- il posto non c'è, è già preso, o manca meno di mezz'ora: la risposta è una sola
    raise exception 'VISITA_NON_DISPONIBILE';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6. Annullare
--
-- Una visita CONFERMATA e non ancora passata, da una delle due parti. Se
-- annulla l'inquilino il posto torna libero; se annulla il proprietario la
-- visita resta come «rifiutata» (annullata), così l'inquilino la vede.
-- ------------------------------------------------------------

create or replace function public.annulla_visita(p_visita uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select vi.id, vi.stato::text as stato, vi.data_ora, vi.candidatura_id,
         l.owner_id, c.tenant_id
    into v
    from visite vi
    join listings l on l.id = vi.listing_id
    left join candidature c on c.id = vi.candidatura_id
   where vi.id = p_visita;

  if not found or (v.owner_id is distinct from auth.uid() and v.tenant_id is distinct from auth.uid()) then
    raise exception 'VISITA_NON_TUA';
  end if;
  if v.stato <> 'confermata' then
    raise exception 'VISITA_NON_ANNULLABILE';
  end if;
  if v.data_ora <= now() then
    raise exception 'VISITA_GIA_PASSATA';
  end if;

  if v.tenant_id = auth.uid() then
    update visite set candidatura_id = null, stato = 'proposta' where id = p_visita;
  else
    update visite set stato = 'rifiutata' where id = p_visita;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. Avvisare l'altra parte
-- ------------------------------------------------------------

alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto',
  'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto',
  'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto',
  'visita_prenotata', 'visita_annullata'
));

create or replace function public.notifica_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings;
  v_tenant uuid;
  v_dati jsonb;
begin
  select * into l from listings where id = new.listing_id;
  v_dati := jsonb_build_object('titolo', left(l.titolo, 80), 'quando', new.data_ora);

  if old.stato = 'proposta' and new.stato = 'confermata' then
    -- un inquilino ha prenotato: lo sa il proprietario
    perform public.crea_notifica(l.owner_id, 'visita_prenotata', v_dati, '/immobili');

  elsif old.stato = 'confermata' and new.stato = 'proposta' then
    -- l'inquilino ha annullato (o ha cancellato l'account): lo sa il proprietario
    perform public.crea_notifica(l.owner_id, 'visita_annullata', v_dati, '/immobili');

  elsif old.stato = 'confermata' and new.stato = 'rifiutata' then
    -- il proprietario ha annullato: lo sa l'inquilino, che ritrova la chat
    select tenant_id into v_tenant from candidature where id = new.candidatura_id;
    perform public.crea_notifica(v_tenant, 'visita_annullata', v_dati, '/chat/' || new.candidatura_id::text);
  end if;

  return new;
end;
$$;

-- Niente «update of stato»: se l'inquilino cancella l'account, la cascata imposta
-- solo `candidatura_id` e lo stato lo cambia il trigger di coerenza. Un trigger
-- legato alla colonna non scatterebbe, e il proprietario non verrebbe avvisato.
drop trigger if exists notifica_visita on visite;
create trigger notifica_visita
  after update on visite
  for each row
  when (old.stato is distinct from new.stato)
  execute function public.notifica_visita();

-- ------------------------------------------------------------
-- 8. Cosa si legge
--
-- Funzioni, non letture dirette: l'inquilino non deve vedere i posti di un
-- immobile a cui non è collegato da un match, e il proprietario riceve il nome
-- di chi ha prenotato (lo stesso che vede già nella chat).
-- ------------------------------------------------------------

-- Tutte le visite dei MIEI immobili: i posti liberi, le prenotazioni, e quelle
-- degli ultimi 30 giorni.
create or replace function public.visite_del_proprietario()
returns table (
  visita_id uuid,
  listing_id uuid,
  titolo text,
  data_ora timestamptz,
  stato text,
  candidatura_id uuid,
  nome_inquilino text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.listing_id,
    l.titolo,
    v.data_ora,
    v.stato::text,
    v.candidatura_id,
    case when v.candidatura_id is null then null
         else coalesce(nullif(btrim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')), ''), 'Utente')
    end
  from visite v
  join listings l on l.id = v.listing_id
  left join candidature c on c.id = v.candidatura_id
  left join profiles p on p.id = c.tenant_id
  where auth.uid() is not null
    and l.owner_id = auth.uid()
    and v.data_ora >= now() - interval '30 days'
  order by v.data_ora;
$$;

-- I posti liberi dell'immobile di UNA mia candidatura accettata.
create or replace function public.posti_liberi_per_candidatura(p_candidatura uuid)
returns table (visita_id uuid, data_ora timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.data_ora
    from visite v
    join candidature c on c.listing_id = v.listing_id
   where auth.uid() is not null
     and c.id = p_candidatura
     and c.tenant_id = auth.uid()
     and c.status = 'accettata'
     and v.candidatura_id is null
     and v.stato = 'proposta'
     and v.data_ora > now() + interval '30 minutes'
   order by v.data_ora
   limit 30;
$$;

-- Le visite di una candidatura, visibili alle due parti.
create or replace function public.visite_della_candidatura(p_candidatura uuid)
returns table (visita_id uuid, data_ora timestamptz, stato text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.data_ora, v.stato::text
    from visite v
    join candidature c on c.id = v.candidatura_id
    join listings l on l.id = c.listing_id
   where auth.uid() is not null
     and v.candidatura_id = p_candidatura
     and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
   order by v.data_ora desc
   limit 10;
$$;

-- Permessi: solo chi ha un account. Le funzioni dei trigger non servono a nessuno.
revoke all on function
  public.crea_slot_visita(uuid, timestamptz), public.elimina_posto_visita(uuid),
  public.prenota_visita(uuid, uuid), public.annulla_visita(uuid),
  public.visite_del_proprietario(), public.posti_liberi_per_candidatura(uuid),
  public.visite_della_candidatura(uuid)
from public, anon;

grant execute on function
  public.crea_slot_visita(uuid, timestamptz), public.elimina_posto_visita(uuid),
  public.prenota_visita(uuid, uuid), public.annulla_visita(uuid),
  public.visite_del_proprietario(), public.posti_liberi_per_candidatura(uuid),
  public.visite_della_candidatura(uuid)
to authenticated;

revoke all on function public.visite_coerenza(), public.notifica_visita() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('crea_slot_visita', 'elimina_posto_visita', 'prenota_visita', 'annulla_visita',
                       'visite_del_proprietario', 'posti_liberi_per_candidatura', 'visite_della_candidatura')
order by 1;   -- 7 righe

-- deve risultare 0: nessuna policy di scrittura sulle visite
select count(*) as policy_di_scrittura_rimaste
from pg_policy where polrelid = 'visite'::regclass and polcmd in ('a', 'w', 'd', '*');

select count(*) as notifica_visita_ammessa
from pg_constraint where conname = 'notifiche_tipo_check'
  and pg_get_constraintdef(oid) like '%visita_prenotata%';   -- 1
