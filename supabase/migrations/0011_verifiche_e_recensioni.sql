-- ============================================================
-- MatchAmI — verifiche e regola sulle recensioni
--
-- La regola, per qualunque proprietario, invitato o no:
--   Una recensione su un inquilino si può lasciare SOLO se
--     1. il proprietario è VERIFICATO, cioè ha almeno un immobile
--        verificato sul portale; e
--     2. esiste un RAPPORTO DI LOCAZIONE VERIFICATO tra lui e quell'inquilino
--        (un contratto caricato che attesti una locazione in corso o
--        passata, controllato da noi).
--   Il rapporto vale per UNA recensione.
--
-- Questa migrazione scrive la regola nel database. La parte in cui si
-- CARICANO i documenti e li controlliamo da un pannello non c'è ancora: per
-- ora chi amministra imposta gli stati con i comandi in fondo a questo
-- file. Finché un immobile e un rapporto non vengono verificati, nessuno può
-- lasciare una recensione.
--
-- Chiude anche un buco trovato provando: un INQUILINO poteva dichiararsi
-- `verificato = true` da solo chiamando l'API (ottenendo "reddito
-- verificato" e 20 punti di affidabilità). Ora lo stato di verifica lo
-- cambia solo chi amministra.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Stato di verifica degli immobili
-- ------------------------------------------------------------

alter table listings
  add column if not exists verifica_stato stato_verifica not null default 'non_avviata',
  add column if not exists verificato_at timestamptz;

-- ------------------------------------------------------------
-- 2. Lo stato di verifica non si dichiara da soli
--
-- Il pannello SQL di Supabase e la chiave di servizio non portano un
-- utente (auth.uid() è null): possono cambiare lo stato. Chi chiama
-- dall'app, con la propria sessione, no.
-- ------------------------------------------------------------

create or replace function public.proteggi_verifica_immobile()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;  -- chi amministra
  end if;

  if tg_op = 'INSERT' then
    -- un annuncio nuovo parte sempre non verificato, qualunque cosa dica la richiesta
    new.verifica_stato := 'non_avviata';
    new.verificato_at := null;
  elsif new.verifica_stato is distinct from old.verifica_stato
     or new.verificato_at is distinct from old.verificato_at then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists immobile_verifica_protetta on listings;
create trigger immobile_verifica_protetta
  before insert or update on listings
  for each row execute function public.proteggi_verifica_immobile();

create or replace function public.proteggi_verifica_inquilino()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;  -- chi amministra, o la registrazione
  end if;

  if tg_op = 'INSERT' then
    new.verificato := false;
    new.verifica_stato := 'non_avviata';
  elsif new.verificato is distinct from old.verificato
     or new.verifica_stato is distinct from old.verifica_stato then
    raise exception 'VERIFICA_RISERVATA: lo stato di verifica lo imposta solo chi gestisce MatchAmI'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists inquilino_verifica_protetta on tenant_profiles;
create trigger inquilino_verifica_protetta
  before insert or update on tenant_profiles
  for each row execute function public.proteggi_verifica_inquilino();

-- ------------------------------------------------------------
-- 3. Un proprietario è verificato se ha un immobile verificato
-- ------------------------------------------------------------

create or replace function public.proprietario_verificato(p_owner uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from listings
    where owner_id = p_owner and verifica_stato = 'verificato'
  );
$$;

grant execute on function public.proprietario_verificato(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Rapporti di locazione
--
-- Un rapporto dice: "questo proprietario ha affittato questo immobile a
-- questo inquilino, in questo periodo", con il contratto a prova. Lo può
-- dichiarare una delle due parti; diventa 'verificato' solo quando lo
-- controlliamo noi.
-- ------------------------------------------------------------

create table if not exists rapporti_locazione (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owner_profiles(profile_id) on delete cascade,
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  periodo_da date not null,
  periodo_a date,                       -- vuoto = locazione ancora in corso
  documento_path text,                  -- il contratto caricato (bucket privato, passo successivo)
  stato text not null default 'da_verificare'
    check (stato in ('da_verificare', 'verificato', 'respinto')),
  creato_da uuid not null references profiles(id) on delete cascade,
  verificato_at timestamptz,
  esito_note text,                      -- nota interna di chi ha controllato
  created_at timestamptz not null default now(),
  check (periodo_a is null or periodo_a >= periodo_da),
  unique (owner_id, tenant_id, listing_id)
);

create index if not exists idx_rapporti_owner on rapporti_locazione(owner_id);
create index if not exists idx_rapporti_tenant on rapporti_locazione(tenant_id);

alter table rapporti_locazione enable row level security;

-- Lo vedono solo le due parti.
create policy "rapporti: le parti leggono" on rapporti_locazione
  for select using (auth.uid() = owner_id or auth.uid() = tenant_id);

-- Lo dichiara una delle due parti, sempre come 'da_verificare', e
-- l'immobile deve essere davvero del proprietario indicato.
create policy "rapporti: una parte lo dichiara" on rapporti_locazione
  for insert with check (
    auth.uid() = creato_da
    and (auth.uid() = owner_id or auth.uid() = tenant_id)
    and stato = 'da_verificare'
    and verificato_at is null
    and esito_note is null
    and exists (
      select 1 from listings l
      where l.id = rapporti_locazione.listing_id
        and l.owner_id = rapporti_locazione.owner_id
    )
  );

-- Chi l'ha dichiarato può ritirarlo finché non è stato controllato.
create policy "rapporti: chi lo ha dichiarato lo ritira" on rapporti_locazione
  for delete using (auth.uid() = creato_da and stato = 'da_verificare');

-- Nessuna policy di UPDATE: lo stato lo cambia solo chi amministra.

-- ------------------------------------------------------------
-- 5. Recensioni: solo con un rapporto verificato, e una per rapporto
-- ------------------------------------------------------------

alter table recensioni
  add column if not exists rapporto_id uuid
  references rapporti_locazione(id) on delete set null;

-- Una recensione per rapporto: un solo contratto non può alimentare più
-- voti. Le recensioni precedenti, senza rapporto, non sono toccate.
create unique index if not exists recensioni_una_per_rapporto
  on recensioni(rapporto_id) where rapporto_id is not null;

drop policy if exists "recensioni: owner writes" on recensioni;

create policy "recensioni: proprietario verificato con rapporto verificato" on recensioni
  for insert with check (
    auth.uid() = autore_id
    and public.proprietario_verificato(auth.uid())
    and exists (
      select 1 from rapporti_locazione r
      where r.id = recensioni.rapporto_id
        and r.owner_id = auth.uid()
        and r.tenant_id = recensioni.tenant_id
        and r.stato = 'verificato'
    )
  );

-- ------------------------------------------------------------
-- 6. Il feedback dall'invito segue la stessa regola
--
-- Un proprietario invitato è un proprietario come gli altri: per
-- lasciare il feedback deve essere verificato e avere un rapporto
-- verificato con chi lo ha invitato.
-- ------------------------------------------------------------

create or replace function completa_invito(
  p_token text,
  p_voto smallint,
  p_tag text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invito inviti_proprietario;
  v_rapporto rapporti_locazione;
  v_recensione_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_voto is null or p_voto < 1 or p_voto > 5 then
    raise exception 'VOTO_NON_VALIDO';
  end if;

  select * into v_invito from inviti_proprietario where token = p_token;
  if not found then
    raise exception 'INVITO_INESISTENTE';
  end if;

  if v_invito.stato <> 'inviato' then
    raise exception 'INVITO_NON_PIU_VALIDO';
  end if;

  if not exists (select 1 from owner_profiles where profile_id = auth.uid()) then
    raise exception 'NON_PROPRIETARIO';
  end if;

  if v_invito.tenant_id = auth.uid() then
    raise exception 'AUTO_INVITO';
  end if;

  -- 1. il proprietario deve essere verificato
  if not proprietario_verificato(auth.uid()) then
    raise exception 'PROPRIETARIO_NON_VERIFICATO';
  end if;

  -- 2. deve esserci un rapporto verificato con questo inquilino, non
  --    ancora usato per un'altra recensione
  select r.* into v_rapporto
    from rapporti_locazione r
   where r.owner_id = auth.uid()
     and r.tenant_id = v_invito.tenant_id
     and r.stato = 'verificato'
     and not exists (select 1 from recensioni x where x.rapporto_id = r.id)
   order by r.created_at
   limit 1;

  if not found then
    if exists (
      select 1 from rapporti_locazione r
       where r.owner_id = auth.uid()
         and r.tenant_id = v_invito.tenant_id
         and r.stato = 'verificato'
    ) then
      raise exception 'RAPPORTO_GIA_RECENSITO';
    end if;
    raise exception 'RAPPORTO_NON_VERIFICATO';
  end if;

  insert into recensioni (tenant_id, autore_id, voto, tag, invito_id, rapporto_id)
  values (v_invito.tenant_id, auth.uid(), p_voto, coalesce(p_tag, '{}'), v_invito.id, v_rapporto.id)
  returning id into v_recensione_id;

  update inviti_proprietario
     set stato = 'completato',
         owner_id = auth.uid(),
         completato_at = now()
   where id = v_invito.id;

  return v_recensione_id;
end;
$$;

grant execute on function completa_invito(text, smallint, text[]) to authenticated;

-- ------------------------------------------------------------
-- 7. Cosa manca a un proprietario per poter lasciare il feedback
--
-- Serve alla pagina d'invito per spiegarlo. Risponde solo su chi la
-- chiama e non rivela l'identità dell'inquilino.
-- ------------------------------------------------------------

create or replace function requisiti_feedback_invito(p_token text)
returns table (
  proprietario_verificato boolean,
  rapporto_verificato boolean,
  rapporto_in_verifica boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    public.proprietario_verificato(auth.uid()),
    exists (
      select 1 from rapporti_locazione r
      join inviti_proprietario i on i.tenant_id = r.tenant_id
      where i.token = p_token and r.owner_id = auth.uid() and r.stato = 'verificato'
    ),
    exists (
      select 1 from rapporti_locazione r
      join inviti_proprietario i on i.tenant_id = r.tenant_id
      where i.token = p_token and r.owner_id = auth.uid() and r.stato = 'da_verificare'
    );
$$;

grant execute on function requisiti_feedback_invito(text) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select column_name from information_schema.columns
where table_name = 'listings' and column_name = 'verifica_stato';

select tgname from pg_trigger
where tgname in ('immobile_verifica_protetta', 'inquilino_verifica_protetta')
order by tgname;

select table_name from information_schema.tables where table_name = 'rapporti_locazione';

select polname from pg_policy
where polrelid = 'recensioni'::regclass and polname like 'recensioni: proprietario verificato%';

select routine_name from information_schema.routines
where routine_name in ('proprietario_verificato', 'completa_invito', 'requisiti_feedback_invito')
order by routine_name;


-- ============================================================
-- PER CHI AMMINISTRA — comandi da eseguire a mano nel pannello SQL
-- (finché non c'è un pannello interno). Funzionano perché il pannello
-- non porta un utente, e solo così lo stato di verifica si può cambiare.
-- ============================================================
--
-- Verificare un immobile (dopo aver controllato visura o atto, e che il
-- nome coincida con quello del proprietario):
--
--   update listings
--      set verifica_stato = 'verificato', verificato_at = now()
--    where id = '<ID DELL''ANNUNCIO>';
--
-- Togliere la verifica a un immobile:
--
--   update listings set verifica_stato = 'non_avviata', verificato_at = null
--    where id = '<ID DELL''ANNUNCIO>';
--
-- Verificare un rapporto di locazione (dopo aver controllato che nel
-- contratto compaiano il proprietario, l'inquilino e l'immobile giusti):
--
--   update rapporti_locazione
--      set stato = 'verificato', verificato_at = now(),
--          esito_note = '<che cosa hai controllato>'
--    where id = '<ID DEL RAPPORTO>';
--
-- Respingerlo:
--
--   update rapporti_locazione
--      set stato = 'respinto', esito_note = '<perché>'
--    where id = '<ID DEL RAPPORTO>';
--
-- Verificare un inquilino (reddito controllato con documenti):
--
--   update tenant_profiles
--      set verificato = true, verifica_stato = 'verificato'
--    where profile_id = '<ID DELL''INQUILINO>';
--
-- Vedere cosa è in attesa di essere controllato:
--
--   select r.id, r.owner_id, r.tenant_id, r.listing_id, r.periodo_da, r.periodo_a
--     from rapporti_locazione r where r.stato = 'da_verificare' order by r.created_at;
-- ============================================================
