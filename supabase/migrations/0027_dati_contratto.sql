-- ============================================================
-- MatchAmI — i dati per generare il contratto
--
-- La bozza del contratto (pagina e PDF) si compone dai dati dell'affitto: chi sono le
-- due parti, quale immobile, canone, durata, date. Questi dati stanno in tabelle con
-- regole di lettura diverse (il profilo dell'altra parte non è leggibile da chiunque,
-- l'indirizzo solo con un match accettato), quindi li dà UNA funzione che controlla chi
-- chiama, invece di aprire quelle tabelle.
--
-- CHI LEGGE: il proprietario dell'immobile e l'inquilino della candidatura di quel
-- contratto, e solo se la candidatura è ACCETTATA. Per chiunque altro non c'è niente:
-- nemmeno si capisce se il contratto esiste.
--
-- COSA NON C'È, perché non lo raccogliamo: codici fiscali, residenze, documenti
-- d'identità, deposito, modalità di pagamento, utenze, registrazione. Nella bozza
-- restano «[da indicare]»: non si inventano mai.
--
-- Non crea tabelle e non salva niente: la bozza si compone al momento e non si conserva.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

create or replace function public.dati_contratto(p_contratto uuid)
returns table (
  contratto_id        uuid,
  stato               stato_contratto,
  canone              integer,
  durata_mesi         smallint,
  data_inizio         date,
  data_firma          date,
  titolo              text,
  zona                text,
  locali              smallint,
  mq                  smallint,
  classe_energetica   text,
  ep_globale          numeric,
  via                 text,
  civico              text,
  cap                 text,
  citta               text,
  locatore_nome       text,
  locatore_cognome    text,
  conduttore_nome     text,
  conduttore_cognome  text,
  io_sono             text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.stato,
         c.canone,
         c.durata_mesi,
         c.data_inizio,
         c.data_firma,
         l.titolo,
         l.zona,
         l.locali,
         l.mq,
         l.classe_energetica,
         l.ep_globale,
         a.via,
         a.civico,
         a.cap,
         a.citta,
         po.nome,
         po.cognome,
         pt.nome,
         pt.cognome,
         case when l.owner_id = auth.uid() then 'locatore' else 'conduttore' end
    from contratti c
    join candidature k on k.id = c.candidatura_id
    join listings l on l.id = k.listing_id
    join profiles po on po.id = l.owner_id
    join profiles pt on pt.id = k.tenant_id
    left join indirizzi_immobili a on a.listing_id = l.id
   where auth.uid() is not null
     and c.id = p_contratto
     and k.status = 'accettata'
     and (k.tenant_id = auth.uid() or l.owner_id = auth.uid());
$$;

revoke all on function public.dati_contratto(uuid) from public, anon;
grant execute on function public.dati_contratto(uuid) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name = 'dati_contratto';   -- 1 riga
