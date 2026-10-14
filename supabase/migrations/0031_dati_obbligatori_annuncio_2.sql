-- ============================================================
-- MatchAmI — dati obbligatori dell'annuncio: tutti quelli che chi cerca può chiedere
--
-- Oltre alla classe energetica (0026), per chiedere la verifica dell'immobile servono: il LUOGO scelto
-- dall'elenco, i BAGNI, il PIANO, il RISCALDAMENTO, il TIPO DI CONTRATTO proposto e la DATA da cui è
-- disponibile (colonne aggiunte dalla 0030). Senza questi dati chi cerca non potrebbe filtrare per bagni,
-- piano, contratto… e la casa resterebbe sempre «non indicato».
--
-- COSA SIGNIFICA «OBBLIGATORIO»: non si può chiedere la verifica (e quindi l'annuncio non diventa visibile),
-- ma si può salvare una bozza incompleta. Gli immobili GIÀ verificati o già in verifica non si toccano.
-- L'elenco è PROVVISORIO (punto 37 degli open point): quali dati la normativa imponga di indicare va
-- confermato con un legale.
--
-- Il piano 0 è il piano terra: «manca» vuol dire vuoto, non zero.
--
-- ORDINE: esegui questa migrazione dopo la 0030 e PRIMA del push del codice.
-- ============================================================

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
  if v_listing.classe_energetica is null
     or v_listing.luogo_id is null
     or v_listing.bagni is null
     or v_listing.piano is null
     or v_listing.riscaldamento is null
     or v_listing.tipo_contratto is null
     or v_listing.disponibile_dal is null then
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

-- stessi permessi di prima
revoke all on function public.richiedi_verifica_immobile(uuid) from public, anon;
grant execute on function public.richiedi_verifica_immobile(uuid) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

-- gli annunci che già c'erano non cambiano: quelli ancora da verificare dovranno completare i dati nuovi prima di inviare
select verifica_stato, count(*) as annunci,
       count(*) filter (where luogo_id is null or bagni is null or piano is null or riscaldamento is null or tipo_contratto is null or disponibile_dal is null) as con_dati_da_completare
from listings group by verifica_stato order by 1;
