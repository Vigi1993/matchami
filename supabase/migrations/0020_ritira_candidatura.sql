-- ============================================================
-- MatchAmI — ritirare una candidatura
--
-- Fin qui una candidatura inviata non si annullava. Ora l'inquilino la può
-- ritirare finché il proprietario non l'ha valutata.
--
-- COME FUNZIONA
--   - un nuovo stato, `ritirata`, raggiungibile solo da «in attesa» con la
--     funzione `ritira_candidatura`;
--   - è DEFINITIVO: il trigger che già impedisce di cambiare una decisione
--     (`blocca_cambio_decisione`) vale anche qui. Non ci si può ricandidare
--     allo stesso annuncio: altrimenti ritirare e riproporre di continuo
--     riempirebbe di notifiche il proprietario;
--   - il proprietario NON la vede più: sparisce dall'elenco e dai conteggi, e
--     non legge più né il profilo né le recensioni di quella persona;
--   - riceve una notifica con il solo titolo dell'annuncio.
--
-- ATTENZIONE, UN VINCOLO DI POSTGRESQL. Un valore aggiunto a un tipo
-- enumerato non si può usare nella stessa transazione in cui nasce, e
-- l'editor SQL di Supabase esegue lo script come un blocco. Per questo, in
-- tutto ciò che si compila subito (policy, vista, vincolo), lo stato si
-- confronta come TESTO (`status::text <> 'ritirata'`), mai con il valore
-- dell'enumerato. Nei corpi delle funzioni non serve: si compilano alla prima
-- esecuzione, a migrazione finita.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lo stato
-- ------------------------------------------------------------

alter type stato_candidatura add value if not exists 'ritirata';

-- ------------------------------------------------------------
-- 2. Ritirare
--
-- Solo la persona che si è candidata, solo da «in attesa». Un id inesistente
-- e una candidatura altrui rispondono allo stesso modo: non si scopre se
-- esiste. L'aggiornamento condizionato rende sicuro il caso di un
-- proprietario che decide nello stesso istante: vince uno solo.
-- ------------------------------------------------------------

create or replace function public.ritira_candidatura(p_candidatura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_stato text;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select tenant_id, status::text into v_tenant, v_stato
    from candidature where id = p_candidatura;
  if v_tenant is distinct from auth.uid() then
    raise exception 'CANDIDATURA_NON_TUA';
  end if;

  if v_stato <> 'in_attesa' then
    raise exception 'CANDIDATURA_NON_RITIRABILE';
  end if;

  update candidature
     set status = 'ritirata', updated_at = now()
   where id = p_candidatura and status = 'in_attesa';
  if not found then
    raise exception 'CANDIDATURA_NON_RITIRABILE';
  end if;
end;
$$;

grant execute on function public.ritira_candidatura(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Il proprietario non la vede più
-- ------------------------------------------------------------

-- 3.1 Le righe di candidatura
drop policy if exists "candidature: owner reads received" on candidature;
create policy "candidature: owner reads received" on candidature
  for select using (
    status::text <> 'ritirata'
    and exists (
      select 1 from listings l
      where l.id = candidature.listing_id and l.owner_id = auth.uid()
    )
  );

-- 3.2 L'elenco dei candidati (stessa vista della 0016, con il filtro in più)
create or replace view public.candidati_del_proprietario
with (security_barrier = true) as
select
  c.id as candidatura_id,
  c.listing_id,
  c.tenant_id,
  c.status as stato,
  p.nome,
  p.cognome,
  case when c.status <> 'rifiutata' then t.professione end as professione,
  case when c.status <> 'rifiutata' then t.reddito_mensile end as reddito_mensile,
  case when c.status <> 'rifiutata' then t.reddito_nucleo end as reddito_nucleo,
  case when c.status <> 'rifiutata' then t.garante end as garante,
  case when c.status <> 'rifiutata' then t.fideiussione end as fideiussione,
  case when c.status <> 'rifiutata' then t.protestato end as protestato,
  case when c.status <> 'rifiutata' then t.verificato end as verificato,
  case when c.status <> 'rifiutata' then t.presentazione end as presentazione,
  case when c.status <> 'rifiutata' then t.avatar_url end as avatar_url,
  case when c.status <> 'rifiutata' then (t.animali is not null) end as animali_compilato,
  case when c.status <> 'rifiutata' then (t.nucleo is not null) end as nucleo_compilato
from candidature c
join listings l on l.id = c.listing_id and l.owner_id = auth.uid()
join profiles p on p.id = c.tenant_id
left join tenant_profiles t on t.profile_id = c.tenant_id
where c.status::text <> 'ritirata';

revoke all on public.candidati_del_proprietario from public, anon;
grant select on public.candidati_del_proprietario to authenticated;

-- 3.3 Le recensioni su un inquilino le leggono, tra i proprietari, solo quelli
-- a cui ha una candidatura ancora valida
drop policy if exists "recensioni: lettura limitata" on recensioni;
create policy "recensioni: lettura limitata" on recensioni
  for select using (
    tenant_id = auth.uid()
    or autore_id = auth.uid()
    or exists (
      select 1
      from candidature c
      join listings l on l.id = c.listing_id
      where c.tenant_id = recensioni.tenant_id
        and l.owner_id = auth.uid()
        and c.status::text <> 'ritirata'
    )
  );

-- 3.4 E l'inquilino non continua a leggere il profilo del proprietario di un
-- annuncio da cui si è ritirato
drop policy if exists "owner_profiles: applicant reads" on owner_profiles;
create policy "owner_profiles: applicant reads" on owner_profiles
  for select using (
    exists (
      select 1
      from candidature c
      join listings l on l.id = c.listing_id
      where l.owner_id = owner_profiles.profile_id
        and c.tenant_id = auth.uid()
        and c.status::text <> 'ritirata'
    )
  );

-- ------------------------------------------------------------
-- 4. Decidere su una candidatura ritirata: un errore chiaro
--
-- Stessa funzione della 0016, con un controllo in più. Senza, il proprietario
-- che decide un istante dopo il ritiro leggerebbe «già valutata».
-- ------------------------------------------------------------

create or replace function public.decidi_candidatura(
  p_candidatura uuid,
  p_stato text,
  p_motivo text,
  p_valutazione jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_stato_attuale text;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_stato not in ('accettata', 'rifiutata') then
    raise exception 'STATO_NON_VALIDO';
  end if;

  if p_stato = 'rifiutata' and p_motivo is null then
    raise exception 'MOTIVO_OBBLIGATORIO';
  end if;

  -- Un id inesistente e una candidatura altrui rispondono allo stesso modo.
  select l.owner_id, c.status::text into v_owner, v_stato_attuale
    from candidature c join listings l on l.id = c.listing_id
   where c.id = p_candidatura;
  if v_owner is distinct from auth.uid() then
    raise exception 'CANDIDATURA_NON_TUA';
  end if;

  if v_stato_attuale = 'ritirata' then
    raise exception 'CANDIDATURA_RITIRATA';
  end if;

  update candidature
     set status = p_stato::stato_candidatura,
         motivo_rifiuto = case when p_stato = 'rifiutata' then p_motivo else null end,
         updated_at = now()
   where id = p_candidatura and status = 'in_attesa';
  if not found then
    raise exception 'CANDIDATURA_GIA_VALUTATA';
  end if;

  if p_valutazione is not null then
    insert into valutazioni_candidati (candidatura_id, valutazione)
    values (p_candidatura, p_valutazione)
    on conflict do nothing;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5. La notifica al proprietario
-- ------------------------------------------------------------

alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto',
  'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto',
  'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto'
));

-- Stessa funzione della 0019, con il ramo del ritiro. Il confronto con lo
-- stato nuovo è dentro il corpo della funzione: si compila alla prima
-- esecuzione, quando il valore dell'enumerato esiste già.
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
  elsif new.status::text = 'ritirata' then
    perform public.crea_notifica(l.owner_id, 'candidatura_ritirata',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/database');
  end if;
  return new;
end;
$$;

revoke all on function public.notifica_candidatura_decisa() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'stato_candidatura' order by e.enumsortorder;   -- 4 righe, l'ultima è «ritirata»

select routine_name from information_schema.routines
where routine_name in ('ritira_candidatura', 'decidi_candidatura') order by 1;   -- 2 righe

select count(*) as notifica_ritirata_ammessa
from pg_constraint where conname = 'notifiche_tipo_check'
  and pg_get_constraintdef(oid) like '%candidatura_ritirata%';   -- 1
