-- ============================================================
-- MatchAmI — "Invita il tuo proprietario"
--
-- Un inquilino che ha già una casa in affitto può invitare il proprio
-- proprietario a iscriversi e a lasciare un feedback sull'esperienza.
-- L'invito è un link con un codice segreto che l'inquilino condivide
-- come preferisce (WhatsApp, messaggio, email dal suo client).
--
-- Cosa aggiunge:
--   1. tabella `inviti_proprietario`
--   2. colonna `recensioni.invito_id` (da dove arriva la recensione)
--   3. due funzioni: una per leggere l'invito dal link, una per
--      completarlo scrivendo la recensione
--
-- NOTA SUL PUNTEGGIO: queste recensioni pesano sull'affidabilità come
-- tutte le altre, come deciso. `invito_id` resta però registrato, così
-- se un domani si volesse dare loro un peso diverso il dato c'è già.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabella degli inviti
-- ------------------------------------------------------------

create table if not exists inviti_proprietario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,

  -- codice segreto che compare nel link
  token text not null unique,

  -- dati raccolti dall'inquilino: sono il contatto del proprietario
  nome_proprietario text not null,
  email_proprietario text,
  indirizzo text,          -- di quale casa si parla
  periodo text,            -- es. "da marzo 2023"

  stato text not null default 'inviato'
    check (stato in ('inviato', 'completato', 'annullato')),

  -- chi ha accettato l'invito, valorizzato al completamento
  owner_id uuid references owner_profiles(profile_id) on delete set null,

  created_at timestamptz not null default now(),
  completato_at timestamptz
);

create index if not exists idx_inviti_tenant on inviti_proprietario(tenant_id);
create index if not exists idx_inviti_token on inviti_proprietario(token);

alter table inviti_proprietario enable row level security;

-- L'inquilino vede e gestisce solo i propri inviti.
create policy "inviti: l'inquilino legge i suoi" on inviti_proprietario
  for select using (auth.uid() = tenant_id);

create policy "inviti: l'inquilino crea i suoi" on inviti_proprietario
  for insert with check (auth.uid() = tenant_id);

create policy "inviti: l'inquilino annulla i suoi" on inviti_proprietario
  for update using (auth.uid() = tenant_id);

-- Nessuna policy di lettura pubblica: chi apre il link legge l'invito
-- attraverso la funzione `invito_pubblico` qui sotto, che restituisce
-- solo i campi necessari alla pagina di atterraggio.

-- ------------------------------------------------------------
-- 2. Provenienza della recensione
-- ------------------------------------------------------------

alter table recensioni
  add column if not exists invito_id uuid
  references inviti_proprietario(id) on delete set null;

-- ------------------------------------------------------------
-- 3. Lettura dell'invito dal link
--
-- Serve anche a chi non ha ancora un account, quindi gira come
-- `security definer`. Restituisce il minimo indispensabile: chi invita,
-- per quale casa, e se l'invito è ancora valido.
-- ------------------------------------------------------------

create or replace function invito_pubblico(p_token text)
returns table (
  nome_inquilino text,
  cognome_inquilino text,
  nome_proprietario text,
  indirizzo text,
  periodo text,
  stato text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.nome, p.cognome, i.nome_proprietario, i.indirizzo, i.periodo, i.stato
  from inviti_proprietario i
  join profiles p on p.id = i.tenant_id
  where i.token = p_token;
$$;

grant execute on function invito_pubblico(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Completamento dell'invito
--
-- Scrive la recensione e chiude l'invito in un colpo solo. È
-- `security definer` perché deve aggiornare un invito che non
-- appartiene a chi sta scrivendo; tutti i controlli sono espliciti
-- qui dentro.
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

  -- deve essersi registrato come proprietario
  if not exists (select 1 from owner_profiles where profile_id = auth.uid()) then
    raise exception 'NON_PROPRIETARIO';
  end if;

  -- nessuno si recensisce da solo
  if v_invito.tenant_id = auth.uid() then
    raise exception 'AUTO_INVITO';
  end if;

  insert into recensioni (tenant_id, autore_id, voto, tag, invito_id)
  values (v_invito.tenant_id, auth.uid(), p_voto, coalesce(p_tag, '{}'), v_invito.id)
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
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables
where table_name = 'inviti_proprietario';

select routine_name from information_schema.routines
where routine_name in ('invito_pubblico', 'completa_invito');
