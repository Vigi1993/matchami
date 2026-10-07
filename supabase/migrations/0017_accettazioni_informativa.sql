-- ============================================================
-- MatchAmI — registro delle accettazioni dell'informativa
--
-- Fin qui il consenso era una casella sì/no (`profiles.privacy_accettata`):
-- nessuna versione, nessuna data, nessun testo a cui riferirsi. Ora ogni
-- accettazione registra QUALE versione dell'informativa e QUANDO.
--
-- Quando il testo cambia (per esempio quando il documento provvisorio viene
-- sostituito da quello di un legale) cambia la versione nel codice, e chi
-- non ha accettato quella versione deve accettarla prima di continuare.
-- Non serve toccare il database.
--
-- La data la mette il database, non il browser: chi accetta non può
-- sceglierla.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice. Se il codice
-- è già online e la migrazione manca, nessuno riesce a superare la schermata
-- di accettazione.
-- ============================================================

create table if not exists accettazioni_informativa (
  user_id uuid not null references profiles(id) on delete cascade,
  versione text not null
    check (versione ~ '^[0-9]{4}-[0-9]{2}(-[a-z0-9]+)+$' and length(versione) <= 60),
  accettata_at timestamptz not null default now(),
  primary key (user_id, versione)
);

alter table accettazioni_informativa enable row level security;

-- Ognuno legge le proprie. Nessuna policy di scrittura: si accetta con la
-- funzione qui sotto, che mette la data.
drop policy if exists "accettazioni: le legge chi le ha date" on accettazioni_informativa;
create policy "accettazioni: le legge chi le ha date" on accettazioni_informativa
  for select using (user_id = auth.uid());

create or replace function public.accetta_informativa(p_versione text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_versione is null
     or p_versione !~ '^[0-9]{4}-[0-9]{2}(-[a-z0-9]+)+$'
     or length(p_versione) > 60 then
    raise exception 'VERSIONE_NON_VALIDA';
  end if;

  -- Accettare due volte la stessa versione non cambia la data della prima.
  insert into accettazioni_informativa (user_id, versione)
  values (auth.uid(), p_versione)
  on conflict (user_id, versione) do nothing;

  select accettata_at into v_data
    from accettazioni_informativa
   where user_id = auth.uid() and versione = p_versione;

  return v_data;
end;
$$;

grant execute on function public.accetta_informativa(text) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables where table_name = 'accettazioni_informativa';

select routine_name from information_schema.routines where routine_name = 'accetta_informativa';

-- deve risultare 0: nessuna policy di scrittura sul registro
select count(*) as policy_di_scrittura_rimaste from pg_policy
where polrelid = 'accettazioni_informativa'::regclass and polcmd in ('a', 'w', 'd');
