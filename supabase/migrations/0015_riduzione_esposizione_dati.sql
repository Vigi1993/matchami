-- ============================================================
-- MatchAmI — meno dati esposti del necessario
--
-- Trovate preparando l'inventario dei dati personali (verificate con
-- utenti diversi su un database vero). Sono le due esposizioni che si
-- correggono senza cambiare nulla di ciò che l'app mostra.
--
--   1. Le recensioni erano leggibili da QUALUNQUE utente connesso, con
--      l'identificativo di chi le aveva scritte. Servono solo a: l'inquilino
--      che le riceve, il proprietario che le ha scritte, e i proprietari a
--      cui quell'inquilino si è candidato (per il punteggio).
--
--   2. `listings.indirizzo`, l'indirizzo esatto dell'immobile, era leggibile
--      da chiunque potesse vedere l'annuncio. L'app non lo ha mai raccolto
--      né mostrato: la colonna è vuota. Si toglie ora; quando servirà (la
--      mappa, punto 30) si farà con una struttura protetta fin dall'inizio,
--      che mostri l'indirizzo esatto solo dopo il match.
--
-- Cosa NON cambia con questa migrazione, e va deciso a parte (vedi
-- l'inventario): i proprietari leggono tutte le colonne del profilo di chi
-- si candida (anche quelle che l'app non mostra, come figli e composizione
-- del nucleo), e continuano a leggerlo anche dopo un rifiuto.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice (il codice non
-- cambia: si può anche eseguire dopo, ma prima è meglio).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chi può leggere le recensioni
--
-- Le letture dell'app sono tre, e restano tutte possibili:
--   - l'inquilino legge i voti su di sé (Home e Profilo);
--   - il proprietario legge i voti di chi si è candidato da lui
--     (Database inquilini, e la decisione di accettare o rifiutare);
--   - le due parti di un affitto leggono il feedback su quell'affitto.
-- ------------------------------------------------------------

drop policy if exists "recensioni: read all" on recensioni;
drop policy if exists "recensioni: lettura limitata" on recensioni;

create policy "recensioni: lettura limitata" on recensioni
  for select using (
    -- l'inquilino legge quelle che lo riguardano
    tenant_id = auth.uid()
    -- il proprietario legge quelle che ha scritto
    or autore_id = auth.uid()
    -- il proprietario legge quelle di un inquilino che si è candidato da lui
    or exists (
      select 1
      from candidature c
      join listings l on l.id = c.listing_id
      where c.tenant_id = recensioni.tenant_id
        and l.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 2. L'indirizzo esatto dell'immobile
--
-- Non si può proteggere revocando la sola colonna: su Supabase il ruolo
-- ha già il permesso sull'intera tabella, e un permesso sulla colonna non
-- toglie quello più ampio. Quindi si toglie la colonna, ma SOLO se è
-- vuota: se qualcuno ci avesse scritto dei dati a mano, non si perdono.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'listings' and column_name = 'indirizzo') then
    if exists (select 1 from listings where indirizzo is not null) then
      raise notice 'listings.indirizzo contiene dati: NON rimossa. Controlla chi può leggerla.';
    else
      alter table listings drop column indirizzo;
      raise notice 'listings.indirizzo era vuota e non usata: rimossa.';
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select polname from pg_policy
where polrelid = 'recensioni'::regclass and polcmd = 'r';   -- una sola: "lettura limitata"

select count(*) as colonna_indirizzo_ancora_presente
from information_schema.columns
where table_schema = 'public' and table_name = 'listings' and column_name = 'indirizzo';
