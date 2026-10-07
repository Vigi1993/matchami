-- ============================================================
-- MatchAmI — il proprietario vede dei candidati solo ciò che serve
--
-- Correzione di tre esposizioni trovate nell'inventario dei dati personali
-- (verificate con utenti diversi su un database vero):
--
--   1. Un proprietario leggeva TUTTE le colonne del profilo di chi si
--      candidava, anche quelle che l'app non mostra e non usa come criterio:
--      numero di figli, composizione del nucleo, animali, e i consensi
--      marketing della persona. Ora legge solo una VISTA con le colonne che
--      servono davvero.
--   2. Continuava a leggere quel profilo anche dopo aver rifiutato il
--      candidato, senza limite di tempo. Ora, dopo un rifiuto, della persona
--      resta solo il nome, per il suo elenco.
--   3. Un inquilino leggeva, dalla propria candidatura decisa, la valutazione
--      che il proprietario aveva fatto di lui: punteggio, criteri non
--      soddisfatti, con il testo dei criteri. Ora la valutazione sta in una
--      tabella che legge solo il proprietario.
--
-- In più, togliendo il permesso di modificare direttamente le candidature, si
-- chiude un altro passaggio trovato provando: un proprietario poteva
-- riassegnare una candidatura a un altro inquilino che non si era mai
-- candidato, aprendo di fatto una chat con lui. Ora le decisioni passano da
-- una funzione.
--
-- ATTENZIONE, ORDINE: questa migrazione e il codice vanno messi online
-- INSIEME. Il codice precedente non trova più le colonne e le tabelle che
-- questa migrazione cambia, e il codice nuovo non funziona senza di essa.
-- Esegui la migrazione e subito dopo fai il push.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La vista: cosa vede il proprietario di chi si candida
--
-- La vista gira con i permessi di chi l'ha creata (non con quelli di chi la
-- interroga), quindi il filtro per proprietario è DENTRO la vista, su
-- auth.uid(). `security_barrier` impedisce che una funzione scritta da chi
-- interroga veda le righe prima del filtro.
--
-- Dopo un rifiuto restano solo nome e cognome (per l'elenco "già valutate").
-- ------------------------------------------------------------

create or replace view public.candidati_del_proprietario
with (security_barrier = true) as
select
  c.id as candidatura_id,
  c.listing_id,
  c.tenant_id,
  c.status as stato,
  p.nome,
  p.cognome,
  case when c.status <> 'rifiutata' then t.professione end as professione,
  case when c.status <> 'rifiutata' then t.reddito_mensile end as reddito_mensile,
  case when c.status <> 'rifiutata' then t.reddito_nucleo end as reddito_nucleo,
  case when c.status <> 'rifiutata' then t.garante end as garante,
  case when c.status <> 'rifiutata' then t.fideiussione end as fideiussione,
  case when c.status <> 'rifiutata' then t.protestato end as protestato,
  case when c.status <> 'rifiutata' then t.verificato end as verificato,
  case when c.status <> 'rifiutata' then t.presentazione end as presentazione,
  case when c.status <> 'rifiutata' then t.avatar_url end as avatar_url,
  -- Animali e composizione del nucleo NON si mostrano al proprietario: servono
  -- solo a sapere se il profilo è compilato. Quindi solo un sì/no.
  case when c.status <> 'rifiutata' then (t.animali is not null) end as animali_compilato,
  case when c.status <> 'rifiutata' then (t.nucleo is not null) end as nucleo_compilato
from candidature c
join listings l on l.id = c.listing_id and l.owner_id = auth.uid()
join profiles p on p.id = c.tenant_id
left join tenant_profiles t on t.profile_id = c.tenant_id;

revoke all on public.candidati_del_proprietario from public, anon;
grant select on public.candidati_del_proprietario to authenticated;

-- Il proprietario non legge più le righe grezze.
drop policy if exists "tenant_profiles: owner reads applicants" on tenant_profiles;
drop policy if exists "profiles: owner reads applicant profile" on profiles;

-- ------------------------------------------------------------
-- 2. La valutazione del proprietario resta del proprietario
-- ------------------------------------------------------------

create table if not exists valutazioni_candidati (
  candidatura_id uuid primary key references candidature(id) on delete cascade,
  valutazione jsonb not null,
  created_at timestamptz not null default now(),
  check (pg_column_size(valutazione) < 20000)
);

alter table valutazioni_candidati enable row level security;

-- Solo il proprietario dell'annuncio. Nessuna policy di scrittura: la
-- valutazione si registra con `decidi_candidatura`.
drop policy if exists "valutazioni: le legge il proprietario" on valutazioni_candidati;
create policy "valutazioni: le legge il proprietario" on valutazioni_candidati
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.id = valutazioni_candidati.candidatura_id and l.owner_id = auth.uid()
    )
  );

-- Le valutazioni già fotografate passano nella tabella nuova.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'candidature'
                and column_name = 'match_proprietario') then
    insert into valutazioni_candidati (candidatura_id, valutazione, created_at)
    select id, match_proprietario, coalesce(match_proprietario_at, now())
      from candidature
     where match_proprietario is not null
    on conflict do nothing;
  end if;
end;
$$;

-- La policy di inserimento delle candidature citava le colonne che stiamo
-- per togliere: si riscrive senza, con le stesse regole di prima.
drop policy if exists "candidature: tenant creates" on candidature;

alter table candidature
  drop column if exists match_proprietario,
  drop column if exists match_proprietario_at;

create policy "candidature: tenant creates" on candidature
  for insert
  with check (
    auth.uid() = tenant_id
    and status = 'in_attesa'
    and exists (
      select 1 from listings l
      where l.id = candidature.listing_id
        and l.pubblicato = true
        and l.verifica_stato = 'verificato'
    )
  );

-- ------------------------------------------------------------
-- 3. Le decisioni passano da una funzione
--
-- Toglie il permesso di modificare direttamente una candidatura: con quello
-- un proprietario poteva anche cambiarne l'inquilino. La funzione decide
-- (una volta sola) e registra la valutazione nello stesso momento.
-- ------------------------------------------------------------

drop policy if exists "candidature: owner updates status" on candidature;

create or replace function public.decidi_candidatura(
  p_candidatura uuid,
  p_stato text,
  p_motivo text,
  p_valutazione jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  if p_stato not in ('accettata', 'rifiutata') then
    raise exception 'STATO_NON_VALIDO';
  end if;

  if p_stato = 'rifiutata' and p_motivo is null then
    raise exception 'MOTIVO_OBBLIGATORIO';
  end if;

  -- Un id inesistente e una candidatura altrui rispondono allo stesso modo.
  select l.owner_id into v_owner
    from candidature c join listings l on l.id = c.listing_id
   where c.id = p_candidatura;
  if v_owner is distinct from auth.uid() then
    raise exception 'CANDIDATURA_NON_TUA';
  end if;

  update candidature
     set status = p_stato::stato_candidatura,
         motivo_rifiuto = case when p_stato = 'rifiutata' then p_motivo else null end,
         updated_at = now()
   where id = p_candidatura and status = 'in_attesa';
  if not found then
    raise exception 'CANDIDATURA_GIA_VALUTATA';
  end if;

  if p_valutazione is not null then
    insert into valutazioni_candidati (candidatura_id, valutazione)
    values (p_candidatura, p_valutazione)
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.decidi_candidatura(uuid, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select table_name from information_schema.tables
where table_name in ('candidati_del_proprietario', 'valutazioni_candidati') order by table_name;

-- deve risultare 0: nessuna policy del proprietario sulle righe grezze dei profili
select count(*) as policy_del_proprietario_rimaste from pg_policy
where polrelid in ('tenant_profiles'::regclass, 'profiles'::regclass)
  and polname in ('tenant_profiles: owner reads applicants', 'profiles: owner reads applicant profile');

-- deve risultare 0: le colonne con la valutazione non sono più nelle candidature
select count(*) as colonne_valutazione_ancora_nelle_candidature
from information_schema.columns
where table_name = 'candidature' and column_name like 'match_proprietario%';

-- deve elencare solo "owner reads received", "tenant creates", "tenant reads own"
select policyname from pg_policies where tablename = 'candidature' order by 1;
