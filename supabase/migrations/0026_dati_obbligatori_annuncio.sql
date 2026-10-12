-- ============================================================
-- MatchAmI — dati obbligatori dell'annuncio: la classe energetica
--
-- Un annuncio di affitto deve dichiarare la classe energetica (APE) e
-- l'indice di prestazione energetica: lo chiede la normativa, e QUALI dati
-- siano obbligatori va CONFERMATO CON UN LEGALE (punto 37). Per questo l'elenco
-- vive in un solo file dell'app (src/lib/annunci/obbligatori.ts), dichiarato
-- provvisorio, e il database fa rispettare soltanto ciò che oggi è deciso:
--   - la classe energetica ha una lista chiusa di valori, controllata qui;
--   - senza la classe energetica NON si può chiedere la verifica dell'immobile.
--
-- Gli immobili GIÀ verificati non si toccano: restano visibili. Il controllo
-- vale per le richieste di verifica nuove.
--
-- I due dati sono PUBBLICI, come la zona e il prezzo: chi vede l'annuncio li vede.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. I dati
-- ------------------------------------------------------------

alter table listings add column if not exists classe_energetica text;
alter table listings add column if not exists ep_globale numeric(6, 2);

alter table listings drop constraint if exists listings_classe_energetica_check;
alter table listings add constraint listings_classe_energetica_check
  check (classe_energetica is null or classe_energetica in ('A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'));

-- kWh/m²·anno: da 0 a 999,99 (un valore oltre è quasi sempre un errore di battitura)
alter table listings drop constraint if exists listings_ep_globale_check;
alter table listings add constraint listings_ep_globale_check
  check (ep_globale is null or (ep_globale >= 0 and ep_globale <= 999.99));

-- ------------------------------------------------------------
-- 2. La richiesta di verifica chiede i dati obbligatori
--
-- Stessa funzione della 0012, con un controllo in più, dopo quelli sullo stato e
-- PRIMA di quello sui documenti: i dati mancanti si correggono in un minuto, i
-- documenti no, e chi non ha né gli uni né gli altri deve sapere da dove cominciare.
-- ------------------------------------------------------------

create or replace function public.richiedi_verifica_immobile(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  select * into v_listing from listings where id = p_listing and owner_id = auth.uid();
  if not found then
    raise exception 'IMMOBILE_NON_TUO';
  end if;
  if v_listing.verifica_stato = 'verificato' then
    raise exception 'GIA_VERIFICATO';
  end if;
  if v_listing.verifica_stato = 'in_verifica' then
    raise exception 'GIA_IN_VERIFICA';
  end if;

  -- i dati obbligatori dell'annuncio
  if v_listing.classe_energetica is null then
    raise exception 'DATI_OBBLIGATORI_MANCANTI';
  end if;

  if not exists (
       select 1 from documenti_verifica
        where owner_id = auth.uid() and tipo = 'identita')
     or not exists (
       select 1 from documenti_verifica
        where owner_id = auth.uid() and tipo = 'proprieta' and listing_id = p_listing)
  then
    raise exception 'DOCUMENTI_MANCANTI';
  end if;

  update listings
     set verifica_stato = 'in_verifica',
         verifica_inviata_at = now(),
         verifica_esito_note = null
   where id = p_listing;
end;
$$;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select count(*) as colonne_nuove from information_schema.columns
where table_name = 'listings' and column_name in ('classe_energetica', 'ep_globale');   -- 2

-- gli annunci già presenti non cambiano: restano senza classe finché il proprietario non la indica
select count(*) as annunci_senza_classe from listings where classe_energetica is null;
