-- ============================================================
-- MatchAmI — preferiti e scarti degli annunci
--
-- Fin qui scartare un annuncio era solo uno stato della pagina: ricaricando
-- ricompariva. E non esisteva un modo di dire «mi interessa, ma non ancora»:
-- l'unico gesto positivo era candidarsi, e subito.
--
-- COME FUNZIONA
--   - un inquilino può SALVARE un annuncio tra i preferiti: esce dal mazzo e si
--     ritrova in una pagina sua, da cui candidarsi o toglierlo;
--   - gli annunci SCARTATI si ricordano per 30 giorni, poi possono riapparire:
--     un prezzo cambia, una casa può tornare interessante, e nasconderla per
--     sempre sarebbe un danno. Per non conservare dati inutili, ogni nuova
--     scelta cancella gli scarti più vecchi di 30 giorni DELLA STESSA PERSONA:
--     la pulizia avviene davvero, senza bisogno di un lavoro programmato;
--   - «annulla» toglie la scelta fatta;
--   - candidarsi a un annuncio salvato lo toglie dai preferiti.
--
-- PRIVACY. Le scelte sono leggibili SOLO dalla persona che le ha fatte. Il
-- proprietario non vede mai né i preferiti né i conteggi. Non si scrive
-- direttamente nella tabella: solo con le funzioni, che controllano ogni cosa.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La tabella
-- ------------------------------------------------------------

create table if not exists scelte_annunci (
  tenant_id  uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  tipo       text not null check (tipo in ('preferito', 'scartato')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, listing_id)
);

create index if not exists scelte_annunci_tipo_idx on scelte_annunci (tenant_id, tipo, created_at desc);

alter table scelte_annunci enable row level security;

drop policy if exists "scelte: solo le mie, in lettura" on scelte_annunci;
create policy "scelte: solo le mie, in lettura" on scelte_annunci
  for select using (tenant_id = auth.uid());

revoke all on scelte_annunci from anon;
revoke insert, update, delete on scelte_annunci from authenticated;

-- ------------------------------------------------------------
-- 2. Scartare e salvare
--
-- Solo gli inquilini; solo annunci che un inquilino può davvero vedere
-- (pubblicati e verificati: le stesse condizioni della lettura degli annunci);
-- niente per un annuncio a cui ci si è già candidati.
-- ------------------------------------------------------------

create or replace function public.scarta_annuncio(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and ruolo = 'inquilino') then
    raise exception 'SOLO_INQUILINI';
  end if;
  if not exists (
    select 1 from listings
     where id = p_listing and pubblicato = true and verifica_stato = 'verificato'
  ) then
    raise exception 'ANNUNCIO_NON_DISPONIBILE';
  end if;
  if exists (select 1 from candidature where tenant_id = auth.uid() and listing_id = p_listing) then
    raise exception 'GIA_CANDIDATO';
  end if;

  -- la pulizia: gli scarti vecchi di chi chiama (e solo i suoi)
  delete from scelte_annunci
   where tenant_id = auth.uid() and tipo = 'scartato'
     and created_at <= now() - interval '30 days';

  insert into scelte_annunci (tenant_id, listing_id, tipo)
  values (auth.uid(), p_listing, 'scartato')
  on conflict (tenant_id, listing_id) do update set tipo = 'scartato', created_at = now();
end;
$$;

create or replace function public.salva_preferito(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and ruolo = 'inquilino') then
    raise exception 'SOLO_INQUILINI';
  end if;
  if not exists (
    select 1 from listings
     where id = p_listing and pubblicato = true and verifica_stato = 'verificato'
  ) then
    raise exception 'ANNUNCIO_NON_DISPONIBILE';
  end if;
  if exists (select 1 from candidature where tenant_id = auth.uid() and listing_id = p_listing) then
    raise exception 'GIA_CANDIDATO';
  end if;

  -- un tetto ai preferiti; salvare di nuovo uno che c'è già non conta
  if (select count(*) from scelte_annunci where tenant_id = auth.uid() and tipo = 'preferito') >= 100
     and not exists (select 1 from scelte_annunci
                      where tenant_id = auth.uid() and listing_id = p_listing and tipo = 'preferito') then
    raise exception 'TROPPI_PREFERITI';
  end if;

  delete from scelte_annunci
   where tenant_id = auth.uid() and tipo = 'scartato'
     and created_at <= now() - interval '30 days';

  insert into scelte_annunci (tenant_id, listing_id, tipo)
  values (auth.uid(), p_listing, 'preferito')
  on conflict (tenant_id, listing_id) do update set tipo = 'preferito', created_at = now();
end;
$$;

-- Toglie la scelta fatta, qualunque sia. Non fa errori se non c'era: «annulla»
-- due volte è innocuo.
create or replace function public.annulla_scelta(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  delete from scelte_annunci where tenant_id = auth.uid() and listing_id = p_listing;
end;
$$;

-- ------------------------------------------------------------
-- 3. Cosa si legge
-- ------------------------------------------------------------

-- Gli annunci da non rimettere nel mazzo: i preferiti (sempre) e gli scarti
-- degli ultimi 30 giorni.
create or replace function public.annunci_nascosti()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select listing_id
    from scelte_annunci
   where tenant_id = auth.uid()
     and (tipo = 'preferito' or created_at > now() - interval '30 days');
$$;

-- I preferiti ancora disponibili, dal più recente, con la prima foto.
create or replace function public.elenco_preferiti()
returns table (
  listing_id uuid,
  titolo text,
  zona text,
  prezzo integer,
  locali smallint,
  mq smallint,
  foto text,
  salvato_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.titolo, l.zona, l.prezzo, l.locali, l.mq,
    (select p.url from listing_photos p where p.listing_id = l.id order by p.ordine limit 1),
    s.created_at
  from scelte_annunci s
  join listings l on l.id = s.listing_id
  where s.tenant_id = auth.uid()
    and s.tipo = 'preferito'
    and l.pubblicato = true
    and l.verifica_stato = 'verificato'
  order by s.created_at desc
  limit 100;
$$;

-- Quanti sono, contando solo quelli ancora disponibili (come l'elenco).
create or replace function public.numero_preferiti()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from scelte_annunci s
    join listings l on l.id = s.listing_id
   where s.tenant_id = auth.uid()
     and s.tipo = 'preferito'
     and l.pubblicato = true
     and l.verifica_stato = 'verificato';
$$;

-- ------------------------------------------------------------
-- 4. Candidarsi a un annuncio salvato lo toglie dai preferiti
-- ------------------------------------------------------------

create or replace function public.pulisci_scelta_dopo_candidatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from scelte_annunci where tenant_id = new.tenant_id and listing_id = new.listing_id;
  return new;
end;
$$;

drop trigger if exists pulisci_scelta_dopo_candidatura on candidature;
create trigger pulisci_scelta_dopo_candidatura
  after insert on candidature
  for each row execute function public.pulisci_scelta_dopo_candidatura();

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

revoke all on function
  public.scarta_annuncio(uuid), public.salva_preferito(uuid), public.annulla_scelta(uuid),
  public.annunci_nascosti(), public.elenco_preferiti(), public.numero_preferiti()
from public, anon;

grant execute on function
  public.scarta_annuncio(uuid), public.salva_preferito(uuid), public.annulla_scelta(uuid),
  public.annunci_nascosti(), public.elenco_preferiti(), public.numero_preferiti()
to authenticated;

revoke all on function public.pulisci_scelta_dopo_candidatura() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select routine_name from information_schema.routines
where routine_name in ('scarta_annuncio', 'salva_preferito', 'annulla_scelta',
                       'annunci_nascosti', 'elenco_preferiti', 'numero_preferiti')
order by 1;   -- 6 righe

-- deve risultare 0: nessuna scrittura diretta per gli utenti
select count(*) as scritture_dirette_possibili
from information_schema.role_table_grants
where table_name = 'scelte_annunci' and grantee in ('authenticated', 'anon')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
