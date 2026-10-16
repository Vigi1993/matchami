-- ============================================================
-- Un immobile è «verificato» solo se ha almeno una prova di proprietà caricata.
--
-- Il flusso vero lo garantiva già (il proprietario chiede la verifica solo con la prova caricata, e i documenti non si possono cancellare), ma il database non lo
-- impediva: uno stato impostato a mano (dati di prova, pannello SQL) poteva dare una casa «verificata» con zero documenti, che gli inquilini vedono come
-- controllata senza che nessuno abbia mai visto una prova. Ora:
--   1. le case già «verificate» ma senza nessuna prova di proprietà tornano «da verificare» (il proprietario carica la prova e chiede la verifica; non si perde nient'altro);
--   2. da qui in poi nessuno, nemmeno lo staff o il pannello SQL, può mettere «verificato» a una casa senza una prova di proprietà: la casa deve ESISTERE prima, e la prova
--      si registra dopo, quindi una casa nasce sempre «da verificare» e diventa «verificata» solo dopo.
-- Rieseguirla non dà errori. ATTENZIONE: il punto 1 cambia lo stato delle case verificate a mano senza prova: gli inquilini smettono di vederle finché non sono verificate davvero.
-- ============================================================

-- ---- 1. riallinea ciò che esiste ----
do $$
declare
  v_riallineati int;
begin
  update listings l
     set verifica_stato = 'non_avviata',
         verificato_at = null,
         verifica_inviata_at = null,
         verifica_esito_note = null
   where l.verifica_stato = 'verificato'
     and not exists (
       select 1 from documenti_verifica d
        where d.listing_id = l.id and d.tipo = 'proprieta'
     );
  get diagnostics v_riallineati = row_count;
  raise notice 'Case verificate senza prova di proprietà, tornate «da verificare»: %', v_riallineati;
end;
$$;

-- ---- 2. da ora in poi, la regola vale per tutti ----
create or replace function public.garantisci_prova_proprieta()
returns trigger
language plpgsql
as $$
begin
  if new.verifica_stato <> 'verificato' then
    return new;
  end if;
  -- una casa già verificata che si modifica in altro non cambia stato: non si ricontrolla
  if tg_op = 'UPDATE' and old.verifica_stato = 'verificato' then
    return new;
  end if;
  if not exists (
       select 1 from documenti_verifica d
        where d.listing_id = new.id and d.tipo = 'proprieta'
     ) then
    raise exception 'PROVA_PROPRIETA_MANCANTE: l''immobile non ha nessuna prova di proprietà caricata' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists garantisci_prova_proprieta on listings;
create trigger garantisci_prova_proprieta
  before insert or update of verifica_stato on listings
  for each row execute function public.garantisci_prova_proprieta();
