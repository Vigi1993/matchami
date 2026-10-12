-- ============================================================
-- MatchAmI — firma di prova del contratto
--
-- Le due parti possono registrare una FIRMA DI PROVA: serve a provare il percorso
-- (chi ha firmato, quando, che cosa) prima di avere un servizio di firma vero. NON HA
-- NESSUN VALORE LEGALE e NON rende il contratto «firmato».
--
-- LA PROMESSA CHE QUESTA MIGRAZIONE FA RISPETTARE, per come è fatta e non per un controllo:
--   - la funzione che le persone chiamano scrive SEMPRE una firma «provvisoria»: non esiste
--     un parametro per dire altrimenti;
--   - nessuna funzione qui cambia lo stato del contratto. Quando ci sarà un servizio vero,
--     avrà una funzione sua, riservata al ruolo di servizio, e ci vorrà una migrazione nuova.
--
-- COSA SI REGISTRA: chi (a ruoli: proprietario o inquilino), quando, e l'IMPRONTA del
-- documento firmato (un hash di tutto il suo testo in quel momento, con il modello usato).
-- Se i dati del contratto cambiano dopo la firma, l'impronta del documento di oggi è
-- diversa da quella registrata e l'app mostra la firma come SUPERATA. Nessuna immagine
-- di firma, nessun indirizzo IP, nessun dato del dispositivo.
--
-- La firma si apre solo quando il contratto è «in firma». Ognuno può ritirare la propria.
-- La tabella non ha nessuna lettura diretta: solo funzioni.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

create table if not exists firme_contratto (
  id               uuid primary key default gen_random_uuid(),
  contratto_id     uuid not null references contratti(id) on delete cascade,
  firmatario       uuid not null references profiles(id) on delete cascade,
  ruolo            text not null check (ruolo in ('locatore', 'conduttore')),
  -- 'provvisoria' = firma di prova; 'fornitore' = per una firma vera, che oggi nessuna funzione può scrivere
  origine          text not null check (origine in ('provvisoria', 'fornitore')),
  fornitore        text not null check (char_length(fornitore) between 1 and 40),
  -- SHA-256 in esadecimale del testo del contratto che si è firmato
  impronta         text not null check (impronta ~ '^[0-9a-f]{64}$'),
  modello_id       text not null check (modello_id ~ '^[a-z][a-z0-9_-]{0,39}$'),
  modello_versione text not null check (char_length(modello_versione) between 1 and 20),
  firmata_at       timestamptz not null default now(),
  unique (contratto_id, firmatario)
);

alter table firme_contratto enable row level security;
revoke all on firme_contratto from anon, authenticated;

-- ------------------------------------------------------------
-- Le firme dei MIEI contratti (di entrambe le parti), in una chiamata sola
-- ------------------------------------------------------------

create or replace function public.firme_dei_miei_contratti()
returns table (
  contratto_id uuid,
  ruolo        text,
  origine      text,
  impronta     text,
  firmata_at   timestamptz,
  mia          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.contratto_id, f.ruolo, f.origine, f.impronta, f.firmata_at, f.firmatario = auth.uid()
    from firme_contratto f
    join contratti c on c.id = f.contratto_id
    join candidature k on k.id = c.candidatura_id
    join listings l on l.id = k.listing_id
   where auth.uid() is not null
     and k.status = 'accettata'
     and (k.tenant_id = auth.uid() or l.owner_id = auth.uid())
   order by f.firmata_at;
$$;

-- ------------------------------------------------------------
-- Firmare (di prova)
--
-- Firmare di nuovo la STESSA versione non cambia niente; firmare una versione DIVERSA
-- (i dati sono cambiati) sostituisce la firma e ne aggiorna la data.
-- ------------------------------------------------------------

create or replace function public.registra_firma_di_prova(
  p_contratto uuid,
  p_impronta text,
  p_modello_id text,
  p_modello_versione text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato stato_contratto;
  v_ruolo text;
  v_esistente firme_contratto;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  -- il contratto si blocca: lo stato non può cambiare mentre si firma
  select c.stato,
         case when l.owner_id = auth.uid() then 'locatore' else 'conduttore' end
    into v_stato, v_ruolo
    from contratti c
    join candidature k on k.id = c.candidatura_id
    join listings l on l.id = k.listing_id
   where c.id = p_contratto
     and k.status = 'accettata'
     and (k.tenant_id = auth.uid() or l.owner_id = auth.uid())
     for update of c;
  if not found then
    raise exception 'FIRMA_CONTRATTO_NON_TUO';
  end if;

  if v_stato <> 'in_firma' then
    raise exception 'FIRMA_CONTRATTO_NON_IN_FIRMA';
  end if;

  if p_impronta is null or p_impronta !~ '^[0-9a-f]{64}$' then
    raise exception 'FIRMA_IMPRONTA_NON_VALIDA';
  end if;
  if p_modello_id is null or p_modello_id !~ '^[a-z][a-z0-9_-]{0,39}$'
     or p_modello_versione is null or char_length(btrim(p_modello_versione)) not between 1 and 20 then
    raise exception 'FIRMA_MODELLO_NON_VALIDO';
  end if;

  select * into v_esistente from firme_contratto where contratto_id = p_contratto and firmatario = auth.uid();

  if found then
    -- una firma VERA (di un servizio di firma) da qui non si tocca: né si sostituisce né si ritira
    if v_esistente.origine <> 'provvisoria' then
      raise exception 'FIRMA_GIA_REGISTRATA';
    end if;

    -- la stessa versione: niente da fare (la data resta quella della prima firma)
    if v_esistente.impronta = p_impronta and v_esistente.modello_id = p_modello_id and v_esistente.modello_versione = btrim(p_modello_versione) then
      return v_esistente.id;
    end if;
    update firme_contratto
       set impronta = p_impronta, modello_id = p_modello_id, modello_versione = btrim(p_modello_versione), firmata_at = now()
     where id = v_esistente.id
    returning id into v_id;
    return v_id;
  end if;

  -- SEMPRE «provvisoria»: non esiste un parametro per scegliere
  insert into firme_contratto (contratto_id, firmatario, ruolo, origine, fornitore, impronta, modello_id, modello_versione)
  values (p_contratto, auth.uid(), v_ruolo, 'provvisoria', 'provvisorio', p_impronta, p_modello_id, btrim(p_modello_versione))
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Ritirare la PROPRIA firma di prova
-- ------------------------------------------------------------

create or replace function public.revoca_firma_di_prova(p_contratto uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  delete from firme_contratto
   where contratto_id = p_contratto
     and firmatario = auth.uid()
     and origine = 'provvisoria';
  if not found then
    raise exception 'FIRMA_NON_TROVATA';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

revoke all on function
  public.firme_dei_miei_contratti(),
  public.registra_firma_di_prova(uuid, text, text, text),
  public.revoca_firma_di_prova(uuid)
from public, anon;

grant execute on function
  public.firme_dei_miei_contratti(),
  public.registra_firma_di_prova(uuid, text, text, text),
  public.revoca_firma_di_prova(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('firme_dei_miei_contratti', 'registra_firma_di_prova', 'revoca_firma_di_prova')
order by 1;   -- 3 righe

-- deve risultare 0: nessun permesso diretto sulla tabella
select count(*) as permessi_diretti_per_gli_utenti
from information_schema.role_table_grants
where table_name = 'firme_contratto' and grantee in ('authenticated', 'anon');

-- deve risultare 0: nessuna funzione di questa migrazione scrive nello stato del contratto
select count(*) as funzioni_che_toccano_lo_stato
from pg_proc where proname in ('firme_dei_miei_contratti', 'registra_firma_di_prova', 'revoca_firma_di_prova')
  and prosrc ~* 'update\s+contratti';
