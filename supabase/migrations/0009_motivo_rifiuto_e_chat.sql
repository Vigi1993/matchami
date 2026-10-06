-- ============================================================
-- MatchAmI — motivo del rifiuto, decisioni irreversibili, chat chiusa
--
-- Aggiunge:
--   1. `candidature.motivo_rifiuto`: perché il proprietario ha rifiutato,
--      da una lista chiusa di cinque voci (niente testo libero).
--   2. un vincolo che rende la decisione irreversibile ANCHE nel database:
--      una candidatura già accettata o rifiutata non cambia più stato.
--   3. una policy più stretta sui messaggi: si scrive solo dopo
--      l'accettazione.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Motivo del rifiuto
--
-- Le chiavi sono le stesse di src/lib/motivi-rifiuto.ts. Un motivo ha
-- senso solo su una candidatura rifiutata.
-- ------------------------------------------------------------

alter table candidature
  add column if not exists motivo_rifiuto text;

alter table candidature
  drop constraint if exists candidature_motivo_rifiuto_valido;
alter table candidature
  add constraint candidature_motivo_rifiuto_valido check (
    motivo_rifiuto is null
    or motivo_rifiuto in (
      'altro_candidato', 'criteri', 'reddito', 'profilo_incompleto', 'non_indicato'
    )
  );

alter table candidature
  drop constraint if exists candidature_motivo_solo_se_rifiutata;
alter table candidature
  add constraint candidature_motivo_solo_se_rifiutata check (
    motivo_rifiuto is null or status = 'rifiutata'
  );

-- ------------------------------------------------------------
-- 2. La decisione non si cambia
--
-- L'app già nasconde i pulsanti dopo la decisione, ma chi chiama
-- direttamente l'API poteva riportare una candidatura accettata a
-- rifiutata (con la chat già aperta e la fotografia del match già
-- scattata). Qui lo stato può uscire da 'in_attesa' una volta sola.
--
-- Chi lavora dal pannello SQL di Supabase può correggere un errore
-- disattivando il trigger per il tempo necessario:
--   alter table candidature disable trigger candidature_decisione_definitiva;
-- ------------------------------------------------------------

create or replace function public.blocca_cambio_decisione()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'in_attesa' and new.status is distinct from old.status then
    raise exception 'DECISIONE_DEFINITIVA: la candidatura è già stata valutata'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists candidature_decisione_definitiva on candidature;
create trigger candidature_decisione_definitiva
  before update on candidature
  for each row execute function public.blocca_cambio_decisione();

-- ------------------------------------------------------------
-- 3. Chat: si scrive solo dopo l'accettazione
--
-- La pagina della chat controllava già lo stato, ma il database lasciava
-- scrivere a chiunque avesse una candidatura, anche in attesa o rifiutata.
-- ------------------------------------------------------------

drop policy if exists "messaggi: parties write" on messaggi;

create policy "messaggi: parties write" on messaggi
  for insert
  with check (
    auth.uid() = mittente_id
    and exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = messaggi.candidatura_id
        and c.status = 'accettata'
        and (c.tenant_id = auth.uid() or l.owner_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select column_name from information_schema.columns
where table_name = 'candidature' and column_name = 'motivo_rifiuto';

select conname from pg_constraint
where conrelid = 'candidature'::regclass and conname like 'candidature_motivo%'
order by conname;

select tgname from pg_trigger
where tgrelid = 'candidature'::regclass and tgname = 'candidature_decisione_definitiva';

select polname from pg_policy
where polrelid = 'messaggi'::regclass and polname = 'messaggi: parties write';
