-- ============================================================
-- Il proprietario può mandare una richiesta («Fai match») a un inquilino che si è reso disponibile.
--
-- Cosa c'è di nuovo:
--   1. il CONSENSO dell'inquilino a farsi trovare dai proprietari (spento di partenza: lo accende lui);
--   2. l'ORIGINE di una candidatura: nata dall'inquilino (come sempre) o da una richiesta del proprietario;
--   3. la tabella delle RICHIESTE, che nessuno scrive direttamente: si passa da due funzioni che controllano tutto;
--   4. due nuovi tipi di notifica.
--
-- Come funziona, in breve: il proprietario manda la richiesta (funzione invia_richiesta_proprietario); l'inquilino
-- riceve una notifica e la trova in «I tuoi match»; se accetta (rispondi_richiesta_proprietario) nasce una candidatura
-- GIÀ ACCETTATA, quindi la chat e tutto il resto funzionano come per ogni match; se rifiuta, finisce lì.
-- ============================================================

-- ---- 1. il consenso a farsi trovare ----
alter table tenant_profiles
  add column if not exists visibile_ai_proprietari boolean not null default false,
  add column if not exists visibile_dal timestamptz;

comment on column tenant_profiles.visibile_ai_proprietari is
  'Consenso dell''inquilino a farsi trovare dai proprietari con un immobile verificato e pubblicato. Spento di partenza.';

-- ---- 2. l'origine di una candidatura ----
alter table candidature
  add column if not exists origine text not null default 'inquilino';
alter table candidature drop constraint if exists candidature_origine_valida;
alter table candidature add constraint candidature_origine_valida check (origine in ('inquilino', 'proprietario'));

-- Una candidatura nata da una richiesta non è una «nuova candidatura» da valutare: il proprietario non riceve la notifica.
create or replace function public.notifica_candidatura_ricevuta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings;
begin
  if new.origine = 'proprietario' then
    return new;
  end if;
  select * into l from listings where id = new.listing_id;
  perform public.crea_notifica(l.owner_id, 'candidatura_ricevuta',
    jsonb_build_object('titolo', left(l.titolo, 80)), '/database');
  return new;
end;
$$;

-- ---- 3. le richieste ----
create table if not exists public.richieste_proprietari (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  owner_id uuid not null references owner_profiles(profile_id) on delete cascade,
  tenant_id uuid not null references tenant_profiles(profile_id) on delete cascade,
  stato text not null default 'inviata' check (stato in ('inviata', 'accettata', 'rifiutata')),
  -- una frase facoltativa del proprietario
  messaggio text check (messaggio is null or char_length(messaggio) between 1 and 280),
  -- il nome di battesimo del proprietario, com'era quando ha mandato la richiesta
  nome_proprietario text check (nome_proprietario is null or char_length(nome_proprietario) <= 60),
  -- la candidatura nata dall'accettazione
  candidatura_id uuid references candidature(id) on delete set null,
  created_at timestamptz not null default now(),
  risposta_at timestamptz,
  unique (listing_id, tenant_id),
  check ((stato = 'inviata') = (risposta_at is null))
);

create index if not exists richieste_proprietari_inquilino_idx on richieste_proprietari (tenant_id, stato);
create index if not exists richieste_proprietari_proprietario_idx on richieste_proprietari (owner_id, created_at desc);

alter table richieste_proprietari enable row level security;

drop policy if exists "richieste: le vede l'inquilino" on richieste_proprietari;
create policy "richieste: le vede l'inquilino" on richieste_proprietari for select to authenticated
  using (tenant_id = auth.uid());
drop policy if exists "richieste: le vede il proprietario" on richieste_proprietari;
create policy "richieste: le vede il proprietario" on richieste_proprietari for select to authenticated
  using (owner_id = auth.uid());

-- Nessuno scrive direttamente: né il proprietario né l'inquilino. Si passa dalle due funzioni qui sotto.
revoke all on richieste_proprietari from anon, authenticated;
grant select on richieste_proprietari to authenticated;

-- ---- 4. i tipi di notifica ----
alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto', 'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto', 'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto', 'visita_prenotata', 'visita_annullata',
  'richiesta_ricevuta', 'richiesta_accettata'
));

-- ---- 5. mandare una richiesta ----
create or replace function public.invia_richiesta_proprietario(
  p_listing uuid,
  p_tenant uuid,
  p_messaggio text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  l listings;
  v_msg text := nullif(btrim(coalesce(p_messaggio, '')), '');
  v_nome text;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'NON_AUTENTICATO: accedi per continuare' using errcode = 'P0001';
  end if;

  select * into l from listings where id = p_listing;
  if not found or l.owner_id <> v_owner then
    raise exception 'NON_TUO_IMMOBILE: puoi scrivere solo per le tue case' using errcode = 'P0001';
  end if;
  if l.pubblicato is not true or l.verifica_stato <> 'verificato' then
    raise exception 'IMMOBILE_NON_PUBBLICATO: la casa deve essere verificata e pubblicata' using errcode = 'P0001';
  end if;

  -- solo chi ha scelto di farsi trovare
  if not exists (select 1 from tenant_profiles where profile_id = p_tenant and visibile_ai_proprietari is true) then
    raise exception 'INQUILINO_NON_DISPONIBILE: questa persona non è disponibile' using errcode = 'P0001';
  end if;

  if exists (select 1 from candidature where listing_id = p_listing and tenant_id = p_tenant) then
    raise exception 'GIA_CANDIDATO: questa persona si è già candidata a questa casa' using errcode = 'P0001';
  end if;
  if exists (select 1 from richieste_proprietari where listing_id = p_listing and tenant_id = p_tenant) then
    raise exception 'RICHIESTA_GIA_INVIATA: hai già scritto a questa persona per questa casa' using errcode = 'P0001';
  end if;

  if v_msg is not null and char_length(v_msg) > 280 then
    raise exception 'MESSAGGIO_TROPPO_LUNGO: al massimo 280 caratteri' using errcode = 'P0001';
  end if;

  -- un freno contro chi scrive a tutti: venti richieste in un giorno
  if (select count(*) from richieste_proprietari where owner_id = v_owner and created_at > now() - interval '1 day') >= 20 then
    raise exception 'TROPPE_RICHIESTE: per oggi hai scritto ad abbastanza persone, riprova domani' using errcode = 'P0001';
  end if;

  select left(nullif(btrim(nome), ''), 60) into v_nome from profiles where id = v_owner;

  insert into richieste_proprietari (listing_id, owner_id, tenant_id, messaggio, nome_proprietario)
  values (p_listing, v_owner, p_tenant, v_msg, v_nome)
  returning id into v_id;

  perform public.crea_notifica(p_tenant, 'richiesta_ricevuta',
    jsonb_build_object('titolo', left(l.titolo, 80), 'nome', coalesce(v_nome, '')), '/candidature');

  return v_id;
end;
$$;

-- ---- 6. rispondere a una richiesta ----
-- Restituisce l'identificativo della candidatura (chat) se si accetta, `null` se si rifiuta.
create or replace function public.rispondi_richiesta_proprietario(p_richiesta uuid, p_accetta boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utente uuid := auth.uid();
  r richieste_proprietari;
  l listings;
  v_candidatura uuid;
begin
  if v_utente is null then
    raise exception 'NON_AUTENTICATO: accedi per continuare' using errcode = 'P0001';
  end if;
  -- «sì» o «no»: una risposta vuota non vale come un rifiuto
  if p_accetta is null then
    raise exception 'RISPOSTA_NON_VALIDA: rispondi sì o no' using errcode = 'P0001';
  end if;

  select * into r from richieste_proprietari where id = p_richiesta for update;
  if not found or r.tenant_id <> v_utente then
    raise exception 'RICHIESTA_NON_TUA: richiesta non trovata' using errcode = 'P0001';
  end if;
  if r.stato <> 'inviata' then
    raise exception 'RICHIESTA_GIA_RISPOSTA: hai già risposto a questa richiesta' using errcode = 'P0001';
  end if;

  if not p_accetta then
    update richieste_proprietari set stato = 'rifiutata', risposta_at = now() where id = r.id;
    return null;
  end if;

  select * into l from listings where id = r.listing_id;
  if not found or l.pubblicato is not true or l.verifica_stato <> 'verificato' then
    raise exception 'IMMOBILE_NON_DISPONIBILE: la casa non è più disponibile' using errcode = 'P0001';
  end if;

  -- La candidatura nasce GIÀ ACCETTATA: è un match, la chat si apre subito.
  insert into candidature (listing_id, tenant_id, status, origine)
  values (r.listing_id, r.tenant_id, 'accettata', 'proprietario')
  returning id into v_candidatura;

  update richieste_proprietari
     set stato = 'accettata', risposta_at = now(), candidatura_id = v_candidatura
   where id = r.id;

  perform public.crea_notifica(r.owner_id, 'richiesta_accettata',
    jsonb_build_object('titolo', left(l.titolo, 80)), '/chat/' || v_candidatura::text);

  return v_candidatura;
end;
$$;

revoke all on function public.invia_richiesta_proprietario(uuid, uuid, text) from public, anon;
revoke all on function public.rispondi_richiesta_proprietario(uuid, boolean) from public, anon;
grant execute on function public.invia_richiesta_proprietario(uuid, uuid, text) to authenticated;
grant execute on function public.rispondi_richiesta_proprietario(uuid, boolean) to authenticated;
