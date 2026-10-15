-- ============================================================
-- Il proprietario può ANNULLARE una decisione: un match o uno scarto. La candidatura torna «in attesa».
--
-- Fino a qui una decisione era definitiva (trigger blocca_cambio_decisione). Ora il proprietario la può annullare, ma SOLO dalla
-- funzione riapri_candidatura, che controlla tutto: nessuna schermata e nessun client può cambiare lo stato a mano (non c'è nessuna
-- policy di modifica sulle candidature, e il trigger lascia passare solo la riapertura fatta dalla funzione).
--
-- Cosa succede:
--   - la candidatura torna «in attesa» e il motivo del rifiuto si cancella;
--   - la valutazione registrata alla decisione si cancella: la prossima decisione ne fotografa una nuova;
--   - l'inquilino riceve una notifica («è di nuovo in attesa»);
--   - se era un MATCH, la chat si chiude (i messaggi restano, si rivedono se si rifà il match);
--   - un match NON si annulla se c'è già un contratto o una visita in programma (da annullare prima).
-- ============================================================

-- ---- 1. il trigger lascia passare la riapertura, e solo quella ----
create or replace function public.blocca_cambio_decisione()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'in_attesa' and new.status is distinct from old.status then
    -- unica eccezione: accettata o rifiutata -> in attesa, fatta dalla funzione riapri_candidatura (che alza questo segnale)
    if old.status in ('accettata', 'rifiutata') and new.status = 'in_attesa'
       and current_setting('matchami.riapertura', true) = 'on' then
      return new;
    end if;
    raise exception 'DECISIONE_DEFINITIVA: la candidatura è già stata valutata'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- 2. il tipo di notifica ----
alter table notifiche drop constraint if exists notifiche_tipo_check;
alter table notifiche add constraint notifiche_tipo_check check (tipo in (
  'candidatura_ricevuta', 'candidatura_accettata', 'candidatura_rifiutata', 'candidatura_ritirata',
  'immobile_verificato', 'immobile_respinto', 'reddito_verificato', 'reddito_respinto',
  'affitto_verificato', 'affitto_respinto', 'rapporto_confermato', 'rapporto_rifiutato',
  'feedback_ricevuto', 'visita_prenotata', 'visita_annullata',
  'richiesta_ricevuta', 'richiesta_accettata',
  'candidatura_riaperta'
));

-- ---- 3. annullare una decisione ----
create or replace function public.riapri_candidatura(p_candidatura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c candidature;
  l listings;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO: accedi per continuare' using errcode = 'P0001';
  end if;

  -- Un id inesistente e una candidatura altrui rispondono allo stesso modo.
  select * into c from candidature where id = p_candidatura for update;
  if not found then
    raise exception 'CANDIDATURA_NON_TUA: candidatura non trovata' using errcode = 'P0001';
  end if;
  select * into l from listings where id = c.listing_id;
  if l.owner_id is distinct from auth.uid() then
    raise exception 'CANDIDATURA_NON_TUA: candidatura non trovata' using errcode = 'P0001';
  end if;

  -- si annulla solo un match o uno scarto: non una candidatura in attesa né una ritirata dall'inquilino
  if c.status::text not in ('accettata', 'rifiutata') then
    raise exception 'NON_DECISA: non c''è nessuna decisione da annullare' using errcode = 'P0001';
  end if;

  -- un match con un contratto o una visita in programma non si annulla
  if c.status::text = 'accettata' then
    if exists (select 1 from contratti where candidatura_id = c.id) then
      raise exception 'HA_UN_CONTRATTO: c''è già un contratto, il match non si può annullare' using errcode = 'P0001';
    end if;
    if exists (select 1 from visite where candidatura_id = c.id and stato in ('proposta', 'confermata') and data_ora >= now()) then
      raise exception 'HA_UNA_VISITA: c''è una visita in programma: annullala prima' using errcode = 'P0001';
    end if;
  end if;

  -- il segnale vale solo dentro questa transazione
  perform set_config('matchami.riapertura', 'on', true);
  update candidature
     set status = 'in_attesa', motivo_rifiuto = null, updated_at = now()
   where id = c.id;
  perform set_config('matchami.riapertura', 'off', true);

  -- la prossima decisione fotografa una valutazione nuova
  delete from valutazioni_candidati where candidatura_id = c.id;

  perform public.crea_notifica(c.tenant_id, 'candidatura_riaperta',
    jsonb_build_object('titolo', left(l.titolo, 80)), '/candidature');
end;
$$;

revoke all on function public.riapri_candidatura(uuid) from public, anon;
grant execute on function public.riapri_candidatura(uuid) to authenticated;
