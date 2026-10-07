-- ============================================================
-- MatchAmI — rapporti di locazione con conferma dell'altra parte
--
-- Il flusso:
--   1. una parte (inquilino o proprietario) DICHIARA un affitto: periodo,
--      immobile e contratto caricato. Riceve un link da mandare all'altra;
--   2. l'altra parte lo apre, vede i dati (NON il contratto) e CONFERMA o
--      RIFIUTA. Se è il proprietario, indica a quale suo immobile si
--      riferisce;
--   3. dopo la conferma il rapporto diventa 'da_verificare' e arriva allo
--      staff, che controlla il contratto e lo verifica o lo respinge;
--   4. con un rapporto verificato (e un proprietario verificato) si può
--      lasciare una recensione (migrazione 0011).
--
-- Perché la conferma: un rapporto inventato da una parte sola non costa
-- niente. Con la conferma serve l'accordo di due persone.
--
-- Chiude anche un passaggio che la aggirava: la 0011 permetteva a una
-- parte di inserire direttamente un rapporto. Ora i rapporti nascono solo
-- dalla funzione di conferma.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Le richieste (il passaggio prima della conferma)
--
-- Nessuna policy di INSERT o UPDATE: si creano e si risolvono solo con le
-- funzioni qui sotto, che controllano ruolo, immobile e file.
-- ------------------------------------------------------------

create table if not exists richieste_rapporto (
  id uuid primary key default gen_random_uuid(),
  -- Il link. 32 caratteri casuali: chi non lo ha ricevuto non può
  -- indovinarlo.
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  creato_da uuid not null references profiles(id) on delete cascade,
  ruolo_creatore text not null check (ruolo_creatore in ('proprietario', 'inquilino')),
  -- Se la crea il proprietario: l'immobile, che è suo. Se la crea
  -- l'inquilino: un'indicazione a testo, perché non conosce l'immobile
  -- come lo conosce il sistema.
  listing_id uuid references listings(id) on delete cascade,
  indirizzo text,
  periodo_da date not null,
  periodo_a date,                      -- vuoto = locazione ancora in corso
  documento_path text not null,        -- il contratto, nel bucket privato
  nome_file text not null,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa', 'confermata', 'rifiutata')),
  controparte_id uuid references profiles(id) on delete set null,
  rapporto_id uuid references rapporti_locazione(id) on delete set null,
  risposta_at timestamptz,
  created_at timestamptz not null default now(),
  check (periodo_a is null or periodo_a >= periodo_da),
  check (
    (ruolo_creatore = 'proprietario' and listing_id is not null)
    or (ruolo_creatore = 'inquilino' and coalesce(btrim(indirizzo), '') <> '')
  )
);

create index if not exists idx_richieste_creato_da on richieste_rapporto(creato_da);

alter table richieste_rapporto enable row level security;

create policy "richieste: le legge chi le ha create" on richieste_rapporto
  for select using (creato_da = auth.uid());

create policy "richieste: chi le ha create le ritira" on richieste_rapporto
  for delete using (creato_da = auth.uid() and stato = 'in_attesa');

-- ------------------------------------------------------------
-- 2. I rapporti nascono solo dalla conferma
-- ------------------------------------------------------------

drop policy if exists "rapporti: una parte lo dichiara" on rapporti_locazione;

-- Chi lo ha dichiarato lo può ritirare finché non è verificato; un
-- rapporto respinto si può togliere per ricominciare.
drop policy if exists "rapporti: chi lo ha dichiarato lo ritira" on rapporti_locazione;
create policy "rapporti: chi lo ha dichiarato lo ritira" on rapporti_locazione
  for delete using (
    auth.uid() = creato_da and stato in ('da_verificare', 'respinto')
  );

-- Lo staff vede i rapporti da controllare.
drop policy if exists "rapporti: lo staff legge" on rapporti_locazione;
create policy "rapporti: lo staff legge" on rapporti_locazione
  for select using (public.is_staff());

-- Le due parti di un rapporto possono leggere nome e cognome l'una
-- dell'altra: servono per riconoscere di quale affitto si parla.
drop policy if exists "profiles: le parti di un rapporto" on profiles;
create policy "profiles: le parti di un rapporto" on profiles
  for select using (
    exists (
      select 1 from rapporti_locazione r
      where (r.owner_id = auth.uid() and r.tenant_id = profiles.id)
         or (r.tenant_id = auth.uid() and r.owner_id = profiles.id)
    )
  );

-- ------------------------------------------------------------
-- 3. Dichiarare un affitto
-- ------------------------------------------------------------

create or replace function public.crea_richiesta_rapporto(
  p_listing uuid,
  p_indirizzo text,
  p_da date,
  p_a date,
  p_path text,
  p_nome text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruolo text;
  v_token text;
  v_indirizzo text := nullif(btrim(p_indirizzo), '');
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select ruolo::text into v_ruolo from profiles where id = auth.uid();
  if not found then
    raise exception 'NON_AUTENTICATO';
  end if;

  if v_ruolo = 'proprietario' then
    if p_listing is null or not exists (
      select 1 from listings where id = p_listing and owner_id = auth.uid()
    ) then
      raise exception 'IMMOBILE_NON_TUO';
    end if;
    v_indirizzo := null;
  elsif v_ruolo = 'inquilino' then
    if v_indirizzo is null or length(v_indirizzo) < 3 or length(v_indirizzo) > 200 then
      raise exception 'INDIRIZZO_NON_VALIDO';
    end if;
    p_listing := null;
  else
    raise exception 'RUOLO_NON_VALIDO';
  end if;

  -- Un affitto "in atto o passato": non può cominciare nel futuro.
  if p_da is null or p_da > current_date or (p_a is not null and p_a < p_da) then
    raise exception 'PERIODO_NON_VALIDO';
  end if;

  -- Il contratto deve stare nella cartella di chi lo dichiara, con il nome
  -- che il caricamento dà ai contratti, e deve esistere davvero.
  if p_path is null or p_path not like auth.uid()::text || '/contratto-%' then
    raise exception 'PERCORSO_NON_VALIDO';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'documenti-verifica' and name = p_path
  ) then
    raise exception 'FILE_NON_TROVATO';
  end if;

  -- Un limite alle richieste ancora senza risposta, contro chi le moltiplica.
  if (select count(*) from richieste_rapporto
       where creato_da = auth.uid() and stato = 'in_attesa') >= 10 then
    raise exception 'TROPPE_RICHIESTE';
  end if;

  insert into richieste_rapporto (
    creato_da, ruolo_creatore, listing_id, indirizzo,
    periodo_da, periodo_a, documento_path, nome_file
  )
  values (
    auth.uid(), v_ruolo, p_listing, v_indirizzo,
    p_da, p_a, p_path, left(coalesce(nullif(btrim(p_nome), ''), 'contratto'), 200)
  )
  returning token into v_token;

  return v_token;
end;
$$;

grant execute on function public.crea_richiesta_rapporto(uuid, text, date, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Cosa vede chi riceve il link
--
-- Può essere chiamata anche senza accesso: chi riceve il link deve poterlo
-- leggere prima di registrarsi. NON restituisce il contratto né il suo
-- percorso: chi conferma non lo vede.
-- ------------------------------------------------------------

create or replace function public.richiesta_rapporto_pubblica(p_token text)
returns table (
  nome_creatore text,
  ruolo_creatore text,
  immobile text,
  periodo_da date,
  periodo_a date,
  stato text,
  scaduta boolean,
  mia boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(nullif(btrim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')), ''), 'Un utente'),
    r.ruolo_creatore,
    case when r.listing_id is not null
         then l.titolo || ' (' || l.zona || ')'
         else r.indirizzo end,
    r.periodo_da,
    r.periodo_a,
    r.stato,
    (r.stato = 'in_attesa' and r.created_at < now() - interval '30 days'),
    (r.creato_da = auth.uid())
  from richieste_rapporto r
  join profiles p on p.id = r.creato_da
  left join listings l on l.id = r.listing_id
  where r.token = p_token;
$$;

grant execute on function public.richiesta_rapporto_pubblica(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Confermare o rifiutare
-- ------------------------------------------------------------

create or replace function public.conferma_richiesta_rapporto(
  p_token text,
  p_listing uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r richieste_rapporto;
  v_ruolo text;
  v_owner uuid;
  v_tenant uuid;
  v_listing uuid;
  v_rapporto uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_r from richieste_rapporto where token = p_token for update;
  if not found then
    raise exception 'RICHIESTA_INESISTENTE';
  end if;
  if v_r.stato <> 'in_attesa' then
    raise exception 'RICHIESTA_GIA_RISPOSTA';
  end if;
  if v_r.created_at < now() - interval '30 days' then
    raise exception 'RICHIESTA_SCADUTA';
  end if;
  if v_r.creato_da = auth.uid() then
    raise exception 'RICHIESTA_TUA';
  end if;

  select ruolo::text into v_ruolo from profiles where id = auth.uid();
  if v_ruolo is null or v_ruolo = v_r.ruolo_creatore then
    raise exception 'STESSO_RUOLO';
  end if;

  if v_r.ruolo_creatore = 'proprietario' then
    v_owner := v_r.creato_da;
    v_tenant := auth.uid();
    v_listing := v_r.listing_id;
  else
    v_owner := auth.uid();
    v_tenant := v_r.creato_da;
    v_listing := p_listing;
    -- l'inquilino ha descritto l'immobile a parole: il proprietario indica
    -- quale dei suoi è
    if v_listing is null or not exists (
      select 1 from listings where id = v_listing and owner_id = auth.uid()
    ) then
      raise exception 'IMMOBILE_NON_TUO';
    end if;
  end if;

  if exists (
    select 1 from rapporti_locazione
    where owner_id = v_owner and tenant_id = v_tenant and listing_id = v_listing
  ) then
    raise exception 'RAPPORTO_ESISTENTE';
  end if;

  insert into rapporti_locazione (
    owner_id, tenant_id, listing_id, periodo_da, periodo_a,
    documento_path, stato, creato_da
  )
  values (
    v_owner, v_tenant, v_listing, v_r.periodo_da, v_r.periodo_a,
    v_r.documento_path, 'da_verificare', v_r.creato_da
  )
  returning id into v_rapporto;

  update richieste_rapporto
     set stato = 'confermata',
         controparte_id = auth.uid(),
         rapporto_id = v_rapporto,
         risposta_at = now()
   where id = v_r.id;

  return v_rapporto;
end;
$$;

grant execute on function public.conferma_richiesta_rapporto(text, uuid) to authenticated;

create or replace function public.rifiuta_richiesta_rapporto(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r richieste_rapporto;
  v_ruolo text;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_r from richieste_rapporto where token = p_token for update;
  if not found then
    raise exception 'RICHIESTA_INESISTENTE';
  end if;
  if v_r.stato <> 'in_attesa' then
    raise exception 'RICHIESTA_GIA_RISPOSTA';
  end if;
  if v_r.creato_da = auth.uid() then
    raise exception 'RICHIESTA_TUA';
  end if;

  select ruolo::text into v_ruolo from profiles where id = auth.uid();
  if v_ruolo is null or v_ruolo = v_r.ruolo_creatore then
    raise exception 'STESSO_RUOLO';
  end if;

  update richieste_rapporto
     set stato = 'rifiutata', controparte_id = auth.uid(), risposta_at = now()
   where id = v_r.id;
end;
$$;

grant execute on function public.rifiuta_richiesta_rapporto(text) to authenticated;

-- ------------------------------------------------------------
-- 6. Il controllo dello staff
-- ------------------------------------------------------------

create or replace function public.esito_rapporto(
  p_rapporto uuid,
  p_verificato boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato text;
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF';
  end if;

  select stato into v_stato from rapporti_locazione where id = p_rapporto;
  if not found then
    raise exception 'RAPPORTO_INESISTENTE';
  end if;
  if v_stato <> 'da_verificare' then
    raise exception 'NON_IN_VERIFICA';
  end if;

  if p_verificato then
    update rapporti_locazione
       set stato = 'verificato', verificato_at = now(), esito_note = null
     where id = p_rapporto;
  else
    if p_note is null or length(btrim(p_note)) < 3 then
      raise exception 'NOTA_OBBLIGATORIA';
    end if;
    update rapporti_locazione
       set stato = 'respinto', verificato_at = null, esito_note = btrim(p_note)
     where id = p_rapporto;
  end if;
end;
$$;

grant execute on function public.esito_rapporto(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables where table_name = 'richieste_rapporto';

select routine_name from information_schema.routines
where routine_name in (
  'crea_richiesta_rapporto', 'richiesta_rapporto_pubblica',
  'conferma_richiesta_rapporto', 'rifiuta_richiesta_rapporto', 'esito_rapporto'
)
order by routine_name;

-- deve risultare 0: la policy che permetteva di inserire un rapporto senza conferma
select count(*) as policy_di_inserimento_diretto_rimaste
from pg_policy
where polrelid = 'rapporti_locazione'::regclass and polcmd = 'a';
