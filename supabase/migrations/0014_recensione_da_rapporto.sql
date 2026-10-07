-- ============================================================
-- MatchAmI — recensione scritta da un affitto verificato
--
-- Fin qui un proprietario poteva lasciare un feedback solo passando da un
-- invito. Ora può farlo anche da un affitto verificato (migrazione 0013),
-- senza invito: `lascia_recensione`.
--
-- La regola è la stessa di sempre: proprietario verificato + affitto
-- verificato con quell'inquilino, e una sola recensione per affitto.
--
-- Chiude anche un buco trovato leggendo le funzioni: i TAG delle
-- recensioni erano testo libero, senza alcun controllo. Chiunque potesse
-- scrivere una recensione poteva metterci qualunque frase. Ora i tag sono
-- una lista chiusa, controllata in ogni punto da cui si può scrivere:
--   - `lascia_recensione` e `completa_invito` (le funzioni);
--   - l'inserimento diretto, che viene tolto: le recensioni nascono solo
--     da queste due funzioni;
--   - un vincolo sulla tabella, che vale anche per chi lavora dal pannello
--     SQL.
--
-- La lista deve restare uguale a TAG_RECENSIONE in src/lib/constants.ts:
-- un test fallisce se le due liste divergono.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. I tag ammessi
-- ------------------------------------------------------------

create or replace function public.tag_recensione_ammessi()
returns text[]
language sql
immutable
as $$
  select array[
    'Puntuale nei pagamenti',
    'Casa lasciata in ottimo stato',
    'Comunicazione facile',
    'Rispettoso del vicinato',
    'Segnala subito i problemi',
    'Rinnoverei il contratto'
  ];
$$;

-- Controlla una lista di tag, toglie i doppioni e restituisce la lista
-- pulita. Un tag fuori lista, o vuoto, fa fallire tutto.
create or replace function public.valida_tag_recensione(p_tag text[])
returns text[]
language plpgsql
immutable
as $$
begin
  if p_tag is not null and exists (
    select 1 from unnest(p_tag) as t
    where t is null or t <> all (public.tag_recensione_ammessi())
  ) then
    raise exception 'TAG_NON_VALIDI';
  end if;

  return coalesce(
    (select array_agg(t order by ord)
       from (select t, min(ord) as ord
               from unnest(p_tag) with ordinality as u(t, ord)
              group by t) x),
    '{}'::text[]
  );
end;
$$;

-- Il vincolo sulla tabella. NOT VALID: vale per ciò che si scrive d'ora
-- in poi, senza rimettere in discussione le righe esistenti. Dopo aver
-- controllato che siano pulite si può completare con:
--   alter table recensioni validate constraint recensioni_tag_ammessi;
alter table recensioni drop constraint if exists recensioni_tag_ammessi;
alter table recensioni
  add constraint recensioni_tag_ammessi
  check (tag <@ public.tag_recensione_ammessi()) not valid;

-- ------------------------------------------------------------
-- 2. Le recensioni nascono solo dalle funzioni
--
-- La policy della 0011 permetteva l'inserimento diretto, ma senza
-- controllare i tag. Senza policy di inserimento, solo le funzioni
-- `security definer` possono scrivere.
-- ------------------------------------------------------------

drop policy if exists "recensioni: proprietario verificato con rapporto verificato" on recensioni;

-- ------------------------------------------------------------
-- 3. Lasciare un feedback da un affitto verificato
-- ------------------------------------------------------------

create or replace function public.lascia_recensione(
  p_rapporto uuid,
  p_voto smallint,
  p_tag text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r rapporti_locazione;
  v_id uuid;
  v_tag text[];
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_voto is null or p_voto < 1 or p_voto > 5 then
    raise exception 'VOTO_NON_VALIDO';
  end if;

  v_tag := public.valida_tag_recensione(p_tag);

  -- Solo il proprietario dell'affitto può recensire l'inquilino. Chi non è
  -- parte dell'affitto riceve la stessa risposta di chi lo ha inventato:
  -- non si scopre se un affitto esiste.
  select * into v_r from rapporti_locazione
   where id = p_rapporto and owner_id = auth.uid();
  if not found then
    raise exception 'RAPPORTO_NON_TUO';
  end if;

  if not proprietario_verificato(auth.uid()) then
    raise exception 'PROPRIETARIO_NON_VERIFICATO';
  end if;

  if v_r.stato <> 'verificato' then
    raise exception 'RAPPORTO_NON_VERIFICATO';
  end if;

  if exists (select 1 from recensioni where rapporto_id = v_r.id) then
    raise exception 'RAPPORTO_GIA_RECENSITO';
  end if;

  begin
    insert into recensioni (tenant_id, autore_id, voto, tag, rapporto_id)
    values (v_r.tenant_id, auth.uid(), p_voto, v_tag, v_r.id)
    returning id into v_id;
  exception when unique_violation then
    -- due richieste insieme per lo stesso affitto: vince la prima
    raise exception 'RAPPORTO_GIA_RECENSITO';
  end;

  return v_id;
end;
$$;

grant execute on function public.lascia_recensione(uuid, smallint, text[]) to authenticated;

-- ------------------------------------------------------------
-- 4. completa_invito: stessa funzione della 0011, con i tag controllati
-- ------------------------------------------------------------

create or replace function completa_invito(
  p_token text,
  p_voto smallint,
  p_tag text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invito inviti_proprietario;
  v_rapporto rapporti_locazione;
  v_recensione_id uuid;
  v_tag text[];
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_voto is null or p_voto < 1 or p_voto > 5 then
    raise exception 'VOTO_NON_VALIDO';
  end if;

  v_tag := public.valida_tag_recensione(p_tag);

  select * into v_invito from inviti_proprietario where token = p_token;
  if not found then
    raise exception 'INVITO_INESISTENTE';
  end if;

  if v_invito.stato <> 'inviato' then
    raise exception 'INVITO_NON_PIU_VALIDO';
  end if;

  if not exists (select 1 from owner_profiles where profile_id = auth.uid()) then
    raise exception 'NON_PROPRIETARIO';
  end if;

  if v_invito.tenant_id = auth.uid() then
    raise exception 'AUTO_INVITO';
  end if;

  if not proprietario_verificato(auth.uid()) then
    raise exception 'PROPRIETARIO_NON_VERIFICATO';
  end if;

  select r.* into v_rapporto
    from rapporti_locazione r
   where r.owner_id = auth.uid()
     and r.tenant_id = v_invito.tenant_id
     and r.stato = 'verificato'
     and not exists (select 1 from recensioni x where x.rapporto_id = r.id)
   order by r.created_at
   limit 1;

  if not found then
    if exists (
      select 1 from rapporti_locazione r
       where r.owner_id = auth.uid()
         and r.tenant_id = v_invito.tenant_id
         and r.stato = 'verificato'
    ) then
      raise exception 'RAPPORTO_GIA_RECENSITO';
    end if;
    raise exception 'RAPPORTO_NON_VERIFICATO';
  end if;

  insert into recensioni (tenant_id, autore_id, voto, tag, invito_id, rapporto_id)
  values (v_invito.tenant_id, auth.uid(), p_voto, v_tag, v_invito.id, v_rapporto.id)
  returning id into v_recensione_id;

  update inviti_proprietario
     set stato = 'completato',
         owner_id = auth.uid(),
         completato_at = now()
   where id = v_invito.id;

  return v_recensione_id;
end;
$$;

grant execute on function completa_invito(text, smallint, text[]) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select array_length(public.tag_recensione_ammessi(), 1) as tag_ammessi;   -- 6

select routine_name from information_schema.routines
where routine_name in ('lascia_recensione', 'valida_tag_recensione', 'tag_recensione_ammessi')
order by routine_name;

-- deve risultare 0: nessuna policy di inserimento diretto sulle recensioni
select count(*) as policy_di_inserimento_rimaste
from pg_policy where polrelid = 'recensioni'::regclass and polcmd = 'a';

-- recensioni esistenti con tag fuori lista: se compaiono righe, vanno
-- sistemate prima di poter completare il vincolo con `validate constraint`
select id, tag from recensioni where not (tag <@ public.tag_recensione_ammessi());
