-- ============================================================
-- L'affitto verificabile nasce dal CONTRATTO fatto su MatchAmI: nessuno deve «dichiararlo».
--
-- Prima un affitto entrava nel sistema solo se qualcuno lo DICHIARAVA (con un link da mandare all'altra persona). Per gli affitti nati qui
-- (candidatura -> match -> contratto) è un giro inutile: i dati ci sono già. Ora:
--   1. il proprietario segna il contratto «firmato» (come prima);
--   2. l'inquilino riceve una notifica e CONFERMA con un tocco, dentro l'app, che l'affitto è davvero cominciato (o dice che non è corretto).
--      La conferma è obbligatoria: lo stato del contratto lo imposta il solo proprietario, e un affitto inventato da una parte sola non
--      deve contare (stessa regola della dichiarazione, che chiede l'accordo di due persone);
--   3. confermato, nasce l'affitto (rapporto di locazione) «da verificare», collegato al contratto;
--   4. una delle due parti carica una copia del contratto registrato per il controllo dello staff, come già si fa per gli affitti
--      dichiarati. Lo staff NON legge i documenti dell'archivio del contratto (sono privati alle due parti): vede solo ciò che le parti
--      caricano apposta per la verifica;
--   5. lo staff verifica (o respinge); con un affitto verificato il proprietario verificato può lasciare il feedback.
-- Senza il documento lo staff non può verificare: la funzione esito_rapporto lo impedisce per gli affitti nati da un contratto.
--
-- Chi dichiara un affitto fuori da MatchAmI (l'inquilino) non cambia. La funzione crea_richiesta_rapporto accetta ancora anche il
-- proprietario, perché i link già mandati devono continuare a funzionare: è l'app a non offrire più la dichiarazione al proprietario.
-- ============================================================

-- ---- 1. la risposta dell'inquilino sul contratto ----
alter table contratti
  add column if not exists inquilino_conferma_at timestamptz,
  add column if not exists inquilino_rifiuta_at timestamptz;
alter table contratti drop constraint if exists contratti_risposta_unica;
alter table contratti add constraint contratti_risposta_unica check (inquilino_conferma_at is null or inquilino_rifiuta_at is null);

-- Il proprietario può scrivere sul contratto (policy esistente), ma NON può rispondere al posto dell'inquilino: quelle due colonne si
-- cambiano solo dalle funzioni qui sotto.
create or replace function public.proteggi_risposta_affitto()
returns trigger
language plpgsql
as $$
begin
  -- chi lavora dal pannello SQL, o le funzioni qui sotto, non è limitato
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.inquilino_conferma_at is not null or new.inquilino_rifiuta_at is not null then
      raise exception 'RISPOSTA_RISERVATA: la risposta sull''affitto la dà solo l''inquilino' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.inquilino_conferma_at is distinct from old.inquilino_conferma_at
     or new.inquilino_rifiuta_at is distinct from old.inquilino_rifiuta_at then
    raise exception 'RISPOSTA_RISERVATA: la risposta sull''affitto la dà solo l''inquilino' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists proteggi_risposta_affitto on contratti;
create trigger proteggi_risposta_affitto before insert or update on contratti
  for each row execute function public.proteggi_risposta_affitto();

-- ---- 2. l'affitto sa da quale contratto è nato ----
alter table rapporti_locazione add column if not exists contratto_id uuid references contratti(id) on delete set null;
create unique index if not exists rapporti_locazione_contratto_idx on rapporti_locazione (contratto_id) where contratto_id is not null;

-- Un affitto nato da un contratto non si ritira a mano: la sua origine è il contratto.
drop policy if exists "rapporti: chi lo ha dichiarato lo ritira" on rapporti_locazione;
create policy "rapporti: chi lo ha dichiarato lo ritira" on rapporti_locazione for delete to authenticated
  using (auth.uid() = creato_da and stato in ('da_verificare', 'respinto') and contratto_id is null);

-- ---- 3. i tipi di notifica ----
alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto', 'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto', 'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto', 'visita_prenotata', 'visita_annullata',
  'richiesta_ricevuta', 'richiesta_accettata',
  'candidatura_riaperta',
  'affitto_da_confermare', 'affitto_confermato', 'affitto_non_confermato'
));

-- ---- 4. quando il contratto è firmato, l'inquilino viene avvisato ----
-- La fine prevista di un contratto: inizio + durata - un giorno (se si sanno entrambi).
create or replace function public.fine_prevista_contratto(p_inizio date, p_mesi smallint)
returns date
language sql
immutable
as $$
  select case when p_inizio is not null and p_mesi is not null and p_mesi > 0
              then (p_inizio + (p_mesi || ' months')::interval - interval '1 day')::date end;
$$;

create or replace function public.avvisa_affitto_da_contratto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k candidature;
  l listings;
  v_fine date;
  v_dati_cambiati boolean;
begin
  select * into k from candidature where id = new.candidatura_id;
  select * into l from listings where id = k.listing_id;

  if new.stato::text not in ('firmato', 'concluso') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_dati_cambiati := old.data_inizio is distinct from new.data_inizio
                    or old.data_firma is distinct from new.data_firma
                    or old.durata_mesi is distinct from new.durata_mesi
                    or old.canone is distinct from new.canone;
  else
    v_dati_cambiati := false;
  end if;

  -- 4a. l'inquilino non ha ancora risposto: lo si avvisa quando il contratto diventa firmato (una volta sola)
  if new.inquilino_conferma_at is null
     and (tg_op = 'INSERT' or old.stato::text not in ('firmato', 'concluso')) then
    perform public.crea_notifica(k.tenant_id, 'affitto_da_confermare',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/gestione');
  end if;

  -- 4b. l'inquilino aveva detto «non è corretto» e il proprietario ha corretto i dati: gli si chiede di nuovo
  if tg_op = 'UPDATE' and new.inquilino_rifiuta_at is not null and v_dati_cambiati then
    update contratti set inquilino_rifiuta_at = null where id = new.id;
    perform public.crea_notifica(k.tenant_id, 'affitto_da_confermare',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/gestione');
  end if;

  -- 4c. il contratto si conclude: l'affitto già nato registra la fine
  if tg_op = 'UPDATE' and new.stato::text = 'concluso' and old.stato::text <> 'concluso' then
    v_fine := least(coalesce(public.fine_prevista_contratto(coalesce(new.data_inizio, new.data_firma), new.durata_mesi), current_date), current_date);
    update rapporti_locazione
       set periodo_a = greatest(periodo_da, v_fine)
     where contratto_id = new.id and periodo_a is null;
  end if;

  return new;
end;
$$;
drop trigger if exists avvisa_affitto_da_contratto on contratti;
create trigger avvisa_affitto_da_contratto after insert or update on contratti
  for each row execute function public.avvisa_affitto_da_contratto();

-- ---- 5. l'inquilino conferma (o no) che l'affitto è cominciato ----
-- Restituisce l'identificativo dell'affitto se conferma, `null` se dice che non è corretto.
create or replace function public.conferma_affitto_contratto(p_contratto uuid, p_conferma boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c contratti;
  k candidature;
  l listings;
  v_inizio date;
  v_fine date;
  v_rapporto uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO: accedi per continuare' using errcode = 'P0001';
  end if;
  if p_conferma is null then
    raise exception 'RISPOSTA_NON_VALIDA: rispondi sì o no' using errcode = 'P0001';
  end if;

  select * into c from contratti where id = p_contratto for update;
  if not found then
    raise exception 'CONTRATTO_NON_TUO: contratto non trovato' using errcode = 'P0001';
  end if;
  select * into k from candidature where id = c.candidatura_id;
  select * into l from listings where id = k.listing_id;
  -- un contratto che non esiste e uno altrui rispondono allo stesso modo
  if k.tenant_id is distinct from auth.uid() then
    raise exception 'CONTRATTO_NON_TUO: contratto non trovato' using errcode = 'P0001';
  end if;

  if c.stato::text not in ('firmato', 'concluso') then
    raise exception 'CONTRATTO_NON_FIRMATO: il contratto non è ancora firmato' using errcode = 'P0001';
  end if;
  if c.inquilino_conferma_at is not null or c.inquilino_rifiuta_at is not null then
    raise exception 'GIA_RISPOSTO: hai già risposto per questo contratto' using errcode = 'P0001';
  end if;

  if not p_conferma then
    update contratti set inquilino_rifiuta_at = now() where id = c.id;
    perform public.crea_notifica(l.owner_id, 'affitto_non_confermato',
      jsonb_build_object('titolo', left(l.titolo, 80)), '/gestione-affitti');
    return null;
  end if;

  v_inizio := coalesce(c.data_inizio, c.data_firma);
  if v_inizio is null then
    raise exception 'DATI_MANCANTI: il contratto non ha una data di inizio' using errcode = 'P0001';
  end if;
  if v_inizio > current_date then
    raise exception 'AFFITTO_NON_ANCORA_INIZIATO: l''affitto non è ancora cominciato' using errcode = 'P0001';
  end if;
  v_fine := case when c.stato::text = 'concluso'
                 then greatest(v_inizio, least(coalesce(public.fine_prevista_contratto(v_inizio, c.durata_mesi), current_date), current_date))
            end;

  -- Se per la stessa casa e le stesse persone c'è già un affitto dichiarato, non se ne fa un secondo: si collega al contratto.
  insert into rapporti_locazione (owner_id, tenant_id, listing_id, periodo_da, periodo_a, creato_da, contratto_id)
  values (l.owner_id, k.tenant_id, l.id, v_inizio, v_fine, k.tenant_id, c.id)
  on conflict (owner_id, tenant_id, listing_id) do update
    set contratto_id = coalesce(rapporti_locazione.contratto_id, excluded.contratto_id)
  returning id into v_rapporto;

  update contratti set inquilino_conferma_at = now() where id = c.id;
  perform public.crea_notifica(l.owner_id, 'affitto_confermato',
    jsonb_build_object('titolo', left(l.titolo, 80)), '/gestione-affitti');
  return v_rapporto;
end;
$$;

-- ---- 6. una delle due parti carica la copia del contratto per lo staff ----
create or replace function public.allega_documento_rapporto(p_rapporto uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r rapporti_locazione;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO: accedi per continuare' using errcode = 'P0001';
  end if;

  select * into r from rapporti_locazione where id = p_rapporto for update;
  if not found or (auth.uid() <> r.owner_id and auth.uid() <> r.tenant_id) then
    raise exception 'RAPPORTO_NON_TUO: affitto non trovato' using errcode = 'P0001';
  end if;
  -- gli affitti dichiarati hanno già il loro contratto (caricato alla dichiarazione)
  if r.contratto_id is null then
    raise exception 'NON_DA_CONTRATTO: questo affitto ha già il suo contratto' using errcode = 'P0001';
  end if;
  if r.stato = 'verificato' then
    raise exception 'GIA_VERIFICATO: l''affitto è già stato verificato' using errcode = 'P0001';
  end if;

  -- il file deve stare nella cartella di chi lo carica, con il nome che il caricamento dà ai contratti, e deve esistere davvero
  if p_path is null or p_path not like auth.uid()::text || '/contratto-%' then
    raise exception 'PERCORSO_NON_VALIDO: file non valido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'documenti-verifica' and name = p_path) then
    raise exception 'FILE_NON_TROVATO: file non trovato' using errcode = 'P0001';
  end if;

  -- anche dopo un rifiuto si può ricaricare: l'affitto torna in attesa del controllo
  update rapporti_locazione
     set documento_path = p_path, stato = 'da_verificare', esito_note = null, verificato_at = null
   where id = r.id;
end;
$$;

-- ---- 7. lo staff non verifica alla cieca ----
create or replace function public.esito_rapporto(p_rapporto uuid, p_verificato boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r rapporti_locazione;
begin
  if not public.is_staff() then
    raise exception 'NON_STAFF';
  end if;

  select * into r from rapporti_locazione where id = p_rapporto;
  if not found then
    raise exception 'RAPPORTO_INESISTENTE';
  end if;
  if r.stato <> 'da_verificare' then
    raise exception 'NON_IN_VERIFICA';
  end if;
  -- un affitto nato da un contratto si verifica solo con il documento che le parti hanno caricato per lo staff
  if r.contratto_id is not null and r.documento_path is null then
    raise exception 'MANCA_DOCUMENTO';
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

revoke all on function public.conferma_affitto_contratto(uuid, boolean) from public, anon;
revoke all on function public.allega_documento_rapporto(uuid, text) from public, anon;
grant execute on function public.conferma_affitto_contratto(uuid, boolean) to authenticated;
grant execute on function public.allega_documento_rapporto(uuid, text) to authenticated;
