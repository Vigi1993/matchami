-- ============================================================
-- MatchAmI — elenco delle conversazioni e messaggi non letti
--
-- Fin qui una chat si raggiungeva solo dal dettaglio di una candidatura, e non
-- c'era modo di sapere se l'altra persona aveva scritto. Ora c'è un elenco con
-- l'ultimo messaggio e il numero dei non letti.
--
-- La colonna `letto` esisteva già, ma nessuno la aggiornava: non c'era una
-- policy di modifica. E chi inviava un messaggio poteva inserirlo già «letto»
-- (la policy di inserimento non guarda quella colonna), cioè sfuggire al
-- conteggio. Si chiudono entrambe le cose:
--   - un trigger azzera `letto` a ogni inserimento: lo stato non lo sceglie
--     chi scrive;
--   - si segna come letto con una funzione, che tocca solo i messaggi
--     DELL'ALTRA persona, nelle proprie conversazioni.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. I messaggi già scritti
--
-- Finora nessuno poteva segnarli come letti, quindi oggi risultano tutti non
-- letti: al primo giorno il conteggio mostrerebbe ogni messaggio mai scritto.
-- Si segnano letti UNA VOLTA SOLA, alla prima esecuzione. Se la migrazione si
-- rilancia, la funzione esiste già e i non letti veri non si toccano.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'segna_messaggi_letti') then
    update messaggi set letto = true where letto = false;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Lo stato «letto» non lo decide chi scrive
-- ------------------------------------------------------------

create or replace function public.messaggi_forza_non_letto()
returns trigger
language plpgsql
as $$
begin
  new.letto := false;
  return new;
end;
$$;

drop trigger if exists messaggi_forza_non_letto on messaggi;
create trigger messaggi_forza_non_letto
  before insert on messaggi
  for each row execute function public.messaggi_forza_non_letto();

revoke update, delete on messaggi from authenticated, anon;

create index if not exists messaggi_conversazione_idx on messaggi (candidatura_id, created_at desc);
create index if not exists messaggi_non_letti_idx on messaggi (candidatura_id) where letto = false;

-- ------------------------------------------------------------
-- 3. Segnare come letti
--
-- Solo i messaggi dell'altra persona: i propri non si «leggono». Solo in una
-- conversazione di cui si è parte; per le altre la risposta è la stessa di un
-- id inesistente.
-- ------------------------------------------------------------

create or replace function public.segna_messaggi_letti(p_candidatura uuid)
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

  if not exists (
    select 1
      from candidature c
      join listings l on l.id = c.listing_id
     where c.id = p_candidatura
       and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
  ) then
    raise exception 'CONVERSAZIONE_NON_TUA';
  end if;

  update messaggi
     set letto = true
   where candidatura_id = p_candidatura
     and mittente_id <> auth.uid()
     and not letto;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.segna_messaggi_letti(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. L'elenco
--
-- Le conversazioni di chi chiama: le candidature ACCETTATE di cui è parte,
-- dalla più recente. Per ciascuna: il titolo dell'annuncio, il nome dell'altra
-- persona (la stessa cosa che si vede già dentro la chat), un'anteprima
-- dell'ultimo messaggio e quanti ne mancano da leggere.
--
-- Una sola chiamata invece di una per conversazione. Chi non è autenticato non
-- ottiene niente (e comunque non ha il permesso di chiamarla).
-- ------------------------------------------------------------

create or replace function public.elenco_conversazioni()
returns table (
  candidatura_id uuid,
  titolo text,
  altro_nome text,
  ultimo_testo text,
  ultimo_at timestamptz,
  ultimo_mio boolean,
  non_letti integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    l.titolo,
    coalesce(nullif(btrim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')), ''), 'Utente'),
    left(ult.testo, 140),
    ult.created_at,
    (ult.mittente_id = auth.uid()),
    (select count(*)::integer
       from messaggi m
      where m.candidatura_id = c.id
        and m.mittente_id <> auth.uid()
        and not m.letto)
  from candidature c
  join listings l on l.id = c.listing_id
  join profiles p on p.id = case when c.tenant_id = auth.uid() then l.owner_id else c.tenant_id end
  left join lateral (
    select m.testo, m.created_at, m.mittente_id
      from messaggi m
     where m.candidatura_id = c.id
     order by m.created_at desc
     limit 1
  ) ult on true
  where auth.uid() is not null
    and c.status = 'accettata'
    and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
  order by coalesce(ult.created_at, c.updated_at) desc
  limit 100;
$$;

revoke all on function public.elenco_conversazioni() from public, anon;
grant execute on function public.elenco_conversazioni() to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('segna_messaggi_letti', 'elenco_conversazioni', 'messaggi_forza_non_letto')
order by 1;   -- 3 righe

select count(*) as trigger_letto from pg_trigger
where tgname = 'messaggi_forza_non_letto' and not tgisinternal;   -- 1

-- deve risultare 0: nessun messaggio resta non letto per via della migrazione
-- (solo alla prima esecuzione: dopo, i non letti sono quelli veri)
select count(*) as non_letti_ora from messaggi where not letto;
