-- ============================================================
-- MatchAmI — parametri di ricerca: luoghi, campi nuovi, funzione per salvare
--
-- 1. LUOGHI: provincia → città → quartiere (per ora Milano e Bergamo). Gli annunci e la ricerca
--    puntano a un luogo; scegliere una città vale per tutti i suoi quartieri.
-- 2. ANNUNCI: tipologia, bagni, piano, riscaldamento, tipo di contratto, disponibilità. Tutti facoltativi
--    (un annuncio già pubblicato non cambia): chi non li indica viene mostrato come «non indicato».
-- 3. RICERCA: budget e metratura «da – a», locali massimi, tipologia; ogni caratteristica può essere
--    NECESSARIA (se la casa non la rispetta sparisce dal mazzo) o opzionale (pesa sul punteggio), e alcune
--    hanno un valore (bagni, piano, riscaldamento, contratto, ingresso, classe energetica).
-- 4. salva_ricerca_inquilino(): salva TUTTA la ricerca in una volta, validandola qui. Prima erano cinque
--    scritture separate che potevano lasciare la ricerca a metà.
--
-- I dati che c'erano restano: le zone e gli annunci scritti come «Isola, Milano» si collegano da soli al luogo.
-- I quartieri di Bergamo e quelli di Milano in più rispetto alle 13 zone di prima sono scritti a memoria:
-- vanno controllati.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. I luoghi
-- ------------------------------------------------------------

create table if not exists luoghi (
  id        uuid primary key default gen_random_uuid(),
  livello   text not null check (livello in ('provincia', 'comune', 'quartiere')),
  nome      text not null check (char_length(nome) between 1 and 80),
  sigla     text check (sigla ~ '^[A-Z]{2}$'),                 -- solo per le province
  parent_id uuid references luoghi(id) on delete restrict,
  -- una provincia non ha un «sopra» e ha la sigla; città e quartieri hanno il «sopra» e non la sigla
  constraint luoghi_gerarchia check (
    (livello = 'provincia' and parent_id is null and sigla is not null)
    or (livello <> 'provincia' and parent_id is not null and sigla is null)
  )
);

create unique index if not exists luoghi_nome_unico
  on luoghi (livello, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
create index if not exists luoghi_parent_idx on luoghi (parent_id);

-- un quartiere sta dentro una città, e una città dentro una provincia
create or replace function public.luoghi_controlla_genitore()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_livello text;
begin
  if new.parent_id is not null then
    select livello into v_livello from luoghi where id = new.parent_id;
    if (new.livello = 'comune' and v_livello is distinct from 'provincia')
       or (new.livello = 'quartiere' and v_livello is distinct from 'comune') then
      raise exception 'LUOGO_NON_VALIDO';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists luoghi_controlla_genitore on luoghi;
create trigger luoghi_controlla_genitore
  before insert or update of livello, parent_id on luoghi
  for each row execute function public.luoghi_controlla_genitore();

-- Si leggono (sono dati pubblici), ma li scrive solo chi gestisce il database
alter table luoghi enable row level security;
drop policy if exists "luoghi: lettura" on luoghi;
create policy "luoghi: lettura" on luoghi for select to authenticated using (true);
revoke all on luoghi from anon, authenticated;
grant select on luoghi to authenticated;

-- «Isola, Milano» per un quartiere, «Milano» per una città, «Provincia di Milano» per una provincia
create or replace function public.luogo_etichetta(p_luogo uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case l.livello
           when 'provincia' then 'Provincia di ' || l.nome
           when 'comune' then l.nome
           else l.nome || ', ' || coalesce(c.nome, '')
         end
    from luoghi l
    left join luoghi c on c.id = l.parent_id
   where l.id = p_luogo;
$$;

-- I dati di partenza (idempotenti: rilanciare non duplica niente)
do $$
declare
  v_prov uuid;
  v_comune uuid;
  v_nome text;
  v_provincia text;
  v_citta text;
  v_quartieri text[];
begin
  for v_provincia, v_citta, v_quartieri in
    select * from (values
      ('Milano', 'Milano', array[
        -- le 13 zone che c'erano
        'Navigli','Isola','Porta Romana','Città Studi','Bicocca','Porta Nuova','Porta Venezia','Sempione','Ticinese','Loreto','NoLo','Certosa','Lambrate',
        -- in più (a memoria: da controllare)
        'Brera','Centro Storico','Porta Genova','Moscova','CityLife','San Siro','Bovisa','Niguarda','Corvetto','Rogoredo','Ripamonti','Washington','Bande Nere','Lorenteggio','Barona','Baggio','Affori','Maciachini','Greco','Forlanini','Gratosoglio'
      ]),
      ('Bergamo', 'Bergamo', array[
        -- tutti a memoria: da controllare
        'Città Alta','Città Bassa','Borgo Palazzo','Borgo Santa Caterina','Borgo Pignolo','Boccaleone','Campagnola','Celadina','Colognola','Conca Fiorita','Grumello al Piano','Longuelo','Loreto','Malpensata','Monterosso','Redona','San Paolo','Santa Lucia','San Tomaso','Valtesse','Villaggio degli Sposi','Carnovali'
      ])
    ) as t(provincia, citta, quartieri)
  loop
    select id into v_prov from luoghi where livello = 'provincia' and lower(nome) = lower(v_provincia);
    if v_prov is null then
      insert into luoghi (livello, nome, sigla) values ('provincia', v_provincia, case v_provincia when 'Milano' then 'MI' else 'BG' end) returning id into v_prov;
    end if;

    select id into v_comune from luoghi where livello = 'comune' and parent_id = v_prov and lower(nome) = lower(v_citta);
    if v_comune is null then
      insert into luoghi (livello, nome, parent_id) values ('comune', v_citta, v_prov) returning id into v_comune;
    end if;

    foreach v_nome in array v_quartieri loop
      if not exists (select 1 from luoghi where livello = 'quartiere' and parent_id = v_comune and lower(nome) = lower(v_nome)) then
        insert into luoghi (livello, nome, parent_id) values ('quartiere', v_nome, v_comune);
      end if;
    end loop;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 2. Gli annunci
-- ------------------------------------------------------------

alter table listings add column if not exists luogo_id uuid references luoghi(id) on delete set null;
alter table listings add column if not exists tipologia text not null default 'appartamento';
alter table listings add column if not exists bagni smallint;
alter table listings add column if not exists piano smallint;
alter table listings add column if not exists riscaldamento text;
alter table listings add column if not exists tipo_contratto text;
alter table listings add column if not exists disponibile_dal date;

alter table listings drop constraint if exists listings_tipologia_check;
alter table listings add constraint listings_tipologia_check check (tipologia in ('appartamento', 'villa', 'posto_letto'));
alter table listings drop constraint if exists listings_bagni_check;
alter table listings add constraint listings_bagni_check check (bagni is null or bagni between 1 and 10);
-- 0 = piano terra, -1 e -2 = seminterrato
alter table listings drop constraint if exists listings_piano_check;
alter table listings add constraint listings_piano_check check (piano is null or piano between -2 and 60);
alter table listings drop constraint if exists listings_riscaldamento_check;
alter table listings add constraint listings_riscaldamento_check check (riscaldamento is null or riscaldamento in ('autonomo', 'centralizzato', 'teleriscaldamento', 'pompa_di_calore'));
alter table listings drop constraint if exists listings_tipo_contratto_check;
alter table listings add constraint listings_tipo_contratto_check check (tipo_contratto is null or tipo_contratto in ('libero_4_4', 'concordato_3_2', 'transitorio', 'studenti'));

create index if not exists idx_listings_luogo on listings (luogo_id);

-- Il luogo e la zona scritta restano coerenti:
--  - se c'è il luogo, la zona è la sua etichetta (e il luogo deve essere un quartiere o una città);
--  - se c'è solo la zona scritta («Isola, Milano»), si cerca il luogo che si chiama così;
--  - se la zona cambia e il luogo no, il luogo si ricalcola dalla zona nuova.
create or replace function public.listings_imposta_luogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_livello text;
begin
  if tg_op = 'UPDATE' and new.zona is distinct from old.zona and new.luogo_id is not distinct from old.luogo_id then
    new.luogo_id := null;
  end if;

  if new.luogo_id is not null then
    select livello into v_livello from luoghi where id = new.luogo_id;
    if v_livello is null or v_livello = 'provincia' then
      raise exception 'LUOGO_NON_VALIDO';
    end if;
    new.zona := public.luogo_etichetta(new.luogo_id);
  elsif new.zona is not null then
    select q.id into v_id
      from luoghi q join luoghi c on c.id = q.parent_id
     where q.livello = 'quartiere' and lower(q.nome || ', ' || c.nome) = lower(btrim(new.zona))
     limit 1;
    if v_id is null then
      select c.id into v_id from luoghi c where c.livello = 'comune' and lower(c.nome) = lower(btrim(new.zona)) limit 1;
    end if;
    new.luogo_id := v_id;   -- può restare vuoto: l'annuncio resta com'è, senza luogo
  end if;
  return new;
end;
$$;

drop trigger if exists listings_imposta_luogo on listings;
create trigger listings_imposta_luogo
  before insert or update of zona, luogo_id on listings
  for each row execute function public.listings_imposta_luogo();

-- gli annunci che ci sono: si collegano al luogo che si chiama come la loro zona
update listings l
   set luogo_id = q.id
  from luoghi q
  join luoghi c on c.id = q.parent_id
 where l.luogo_id is null
   and q.livello = 'quartiere'
   and lower(q.nome || ', ' || c.nome) = lower(btrim(l.zona));

-- ------------------------------------------------------------
-- 3. La ricerca dell'inquilino
-- ------------------------------------------------------------

alter table tenant_profiles add column if not exists budget_min integer;
alter table tenant_profiles add column if not exists locali_max smallint;
alter table tenant_profiles add column if not exists mq_max smallint;
alter table tenant_profiles add column if not exists tipologia text not null default 'appartamento';

alter table tenant_profiles drop constraint if exists tenant_profiles_budget_min_check;
alter table tenant_profiles add constraint tenant_profiles_budget_min_check check (budget_min is null or budget_min between 0 and 20000);
alter table tenant_profiles drop constraint if exists tenant_profiles_locali_max_check;
alter table tenant_profiles add constraint tenant_profiles_locali_max_check check (locali_max is null or locali_max between 1 and 10);
alter table tenant_profiles drop constraint if exists tenant_profiles_mq_max_check;
alter table tenant_profiles add constraint tenant_profiles_mq_max_check check (mq_max is null or mq_max between 10 and 1000);
alter table tenant_profiles drop constraint if exists tenant_profiles_tipologia_check;
alter table tenant_profiles add constraint tenant_profiles_tipologia_check check (tipologia in ('appartamento', 'villa', 'posto_letto'));
-- il minimo non supera il massimo
alter table tenant_profiles drop constraint if exists tenant_profiles_budget_intervallo;
alter table tenant_profiles add constraint tenant_profiles_budget_intervallo check (budget_min is null or budget_max is null or budget_min <= budget_max);
alter table tenant_profiles drop constraint if exists tenant_profiles_locali_intervallo;
alter table tenant_profiles add constraint tenant_profiles_locali_intervallo check (locali_min is null or locali_max is null or locali_min <= locali_max);
alter table tenant_profiles drop constraint if exists tenant_profiles_mq_intervallo;
alter table tenant_profiles add constraint tenant_profiles_mq_intervallo check (mq_min is null or mq_max is null or mq_min <= mq_max);

-- le caratteristiche: necessarie o opzionali, e con un valore se ne hanno uno
alter table tenant_interessi add column if not exists necessaria boolean not null default false;
alter table tenant_interessi add column if not exists valore jsonb;
alter table tenant_interessi drop constraint if exists tenant_interessi_valore_piccolo;
alter table tenant_interessi add constraint tenant_interessi_valore_piccolo check (valore is null or pg_column_size(valore) <= 600);
alter table tenant_interessi drop constraint if exists tenant_interessi_chiave_valida;
alter table tenant_interessi add constraint tenant_interessi_chiave_valida check (attributo_key ~ '^[A-Za-z][A-Za-z0-9]{1,30}$');

-- le zone: a un luogo (quartiere, città o provincia). `zona` resta, con l'etichetta del luogo
alter table tenant_zone_interesse add column if not exists luogo_id uuid references luoghi(id) on delete cascade;
create unique index if not exists tenant_zone_interesse_luogo_unico on tenant_zone_interesse (tenant_id, luogo_id) where luogo_id is not null;

update tenant_zone_interesse z
   set luogo_id = q.id
  from luoghi q
  join luoghi c on c.id = q.parent_id
 where z.luogo_id is null
   and q.livello = 'quartiere'
   and lower(q.nome || ', ' || c.nome) = lower(btrim(z.zona));

-- ------------------------------------------------------------
-- 4. Salvare la ricerca: tutta insieme, validata qui
--
-- Riceve un oggetto JSON:
--   { tipologia, budget_min, budget_max, locali_min, locali_max, mq_min, mq_max,
--     luoghi: [id…],
--     criteri: [ { chiave, necessaria, peso, valore } … ] }
-- Un valore fuori dai limiti, una chiave sconosciuta o un luogo che non esiste fanno fallire TUTTO, senza
-- cambiare niente.
-- ------------------------------------------------------------

-- un numero intero di un oggetto JSON, o nulla se manca; errore se non è un intero nei limiti
create or replace function public.ricerca_intero(p_json jsonb, p_chiave text, p_min integer, p_max integer)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb := p_json -> p_chiave;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^-?[0-9]{1,9}$' then
    raise exception 'RICERCA_NON_VALIDA';
  end if;
  if (v #>> '{}')::integer < p_min or (v #>> '{}')::integer > p_max then
    raise exception 'RICERCA_NON_VALIDA';
  end if;
  return (v #>> '{}')::integer;
end;
$$;

create or replace function public.salva_ricerca_inquilino(p_ricerca jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tipologia text;
  v_bmin integer; v_bmax integer; v_lmin integer; v_lmax integer; v_qmin integer; v_qmax integer;
  v_luoghi uuid[] := '{}';
  v_id text;
  v_criteri jsonb;
  v_c jsonb;
  v_chiave text;
  v_valore jsonb;
  v_pulito jsonb;
  v_necessaria boolean;
  v_peso integer;
  v_viste text[] := '{}';
  v_righe jsonb := '[]'::jsonb;
  v_tipi jsonb;
  v_t text;
  v_min integer; v_max integer;
  v_booleani constant text[] := array['balcone','terrazzo','giardino','doppiaEsposizione','ascensore','portineria','ariaCondizionata','boxAuto','cantina','arredato','animaliAmmessi'];
  v_riscaldamenti constant text[] := array['autonomo','centralizzato','teleriscaldamento','pompa_di_calore'];
  v_contratti constant text[] := array['libero_4_4','concordato_3_2','transitorio','studenti'];
  v_classi constant text[] := array['A4','A3','A2','A1','B','C','D','E','F','G'];
begin
  if v_uid is null then
    raise exception 'NON_AUTENTICATO';
  end if;
  if p_ricerca is null or jsonb_typeof(p_ricerca) <> 'object' then
    raise exception 'RICERCA_NON_VALIDA';
  end if;
  perform 1 from tenant_profiles where profile_id = v_uid;
  if not found then
    raise exception 'NON_SEI_UN_INQUILINO';
  end if;

  -- ---- tipologia ----
  v_tipologia := coalesce(p_ricerca ->> 'tipologia', 'appartamento');
  if v_tipologia not in ('appartamento', 'villa', 'posto_letto') then
    raise exception 'RICERCA_NON_VALIDA';
  end if;
  if v_tipologia = 'posto_letto' then
    raise exception 'TIPOLOGIA_NON_DISPONIBILE';
  end if;

  -- ---- budget, locali, metratura ----
  v_bmin := public.ricerca_intero(p_ricerca, 'budget_min', 0, 20000);
  v_bmax := public.ricerca_intero(p_ricerca, 'budget_max', 1, 20000);
  v_lmin := public.ricerca_intero(p_ricerca, 'locali_min', 1, 10);
  v_lmax := public.ricerca_intero(p_ricerca, 'locali_max', 1, 10);
  v_qmin := public.ricerca_intero(p_ricerca, 'mq_min', 10, 1000);
  v_qmax := public.ricerca_intero(p_ricerca, 'mq_max', 10, 1000);
  if (v_bmin is not null and v_bmax is not null and v_bmin > v_bmax)
     or (v_lmin is not null and v_lmax is not null and v_lmin > v_lmax)
     or (v_qmin is not null and v_qmax is not null and v_qmin > v_qmax) then
    raise exception 'INTERVALLO_NON_VALIDO';
  end if;

  -- ---- luoghi ----
  if p_ricerca ? 'luoghi' and jsonb_typeof(p_ricerca -> 'luoghi') <> 'null' then
    if jsonb_typeof(p_ricerca -> 'luoghi') <> 'array' then
      raise exception 'RICERCA_NON_VALIDA';
    end if;
    if jsonb_array_length(p_ricerca -> 'luoghi') > 20 then
      raise exception 'TROPPI_LUOGHI';
    end if;
    for v_id in select jsonb_array_elements_text(p_ricerca -> 'luoghi') loop
      if v_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or not exists (select 1 from luoghi where id = v_id::uuid) then
        raise exception 'LUOGO_NON_VALIDO';
      end if;
      if not (v_id::uuid = any (v_luoghi)) then
        v_luoghi := v_luoghi || v_id::uuid;
      end if;
    end loop;
  end if;

  -- ---- caratteristiche ----
  v_criteri := coalesce(nullif(p_ricerca -> 'criteri', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(v_criteri) <> 'array' then
    raise exception 'RICERCA_NON_VALIDA';
  end if;
  if jsonb_array_length(v_criteri) > 40 then
    raise exception 'TROPPI_CRITERI';
  end if;

  for v_c in select jsonb_array_elements(v_criteri) loop
    if jsonb_typeof(v_c) <> 'object' or jsonb_typeof(v_c -> 'chiave') <> 'string' then
      raise exception 'CRITERIO_NON_VALIDO';
    end if;
    v_chiave := v_c ->> 'chiave';
    if v_chiave = any (v_viste) then
      raise exception 'CRITERIO_NON_VALIDO';
    end if;
    v_viste := v_viste || v_chiave;

    v_necessaria := coalesce(v_c -> 'necessaria', 'false'::jsonb) = 'true'::jsonb;
    if v_c ? 'necessaria' and jsonb_typeof(v_c -> 'necessaria') not in ('boolean', 'null') then
      raise exception 'CRITERIO_NON_VALIDO';
    end if;
    v_peso := coalesce(public.ricerca_intero(v_c, 'peso', 1, 10), 5);
    v_valore := v_c -> 'valore';
    v_pulito := null;

    if v_chiave = any (v_booleani) then
      -- sì/no: nessun valore
      v_pulito := null;
    elsif v_chiave = 'bagni' then
      if v_valore is null or jsonb_typeof(v_valore) <> 'object' then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_min := public.ricerca_intero(v_valore, 'min', 1, 6);
      if v_min is null then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_pulito := jsonb_build_object('min', v_min);
    elsif v_chiave = 'piano' then
      if v_valore is null or jsonb_typeof(v_valore) <> 'object' then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_min := public.ricerca_intero(v_valore, 'min', -2, 60);
      v_max := public.ricerca_intero(v_valore, 'max', -2, 60);
      if (v_min is null and v_max is null) or (v_min is not null and v_max is not null and v_min > v_max) then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_pulito := jsonb_build_object('min', v_min, 'max', v_max);
    elsif v_chiave in ('riscaldamento', 'contratto') then
      if v_valore is null or jsonb_typeof(v_valore) <> 'object' or jsonb_typeof(v_valore -> 'tipi') is distinct from 'array' then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_tipi := '[]'::jsonb;
      for v_t in select jsonb_array_elements_text(v_valore -> 'tipi') loop
        if not (v_t = any (case when v_chiave = 'riscaldamento' then v_riscaldamenti else v_contratti end)) then raise exception 'CRITERIO_NON_VALIDO'; end if;
        if not (v_tipi ? v_t) then v_tipi := v_tipi || to_jsonb(v_t); end if;
      end loop;
      if jsonb_array_length(v_tipi) = 0 then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_pulito := jsonb_build_object('tipi', v_tipi);
    elsif v_chiave = 'ingresso' then
      if v_valore is null or jsonb_typeof(v_valore) <> 'object' or jsonb_typeof(v_valore -> 'entro') is distinct from 'string' then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_t := v_valore ->> 'entro';
      if v_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'CRITERIO_NON_VALIDO'; end if;
      begin
        if to_char(v_t::date, 'YYYY-MM-DD') <> v_t then raise exception 'CRITERIO_NON_VALIDO'; end if;
      exception when others then
        raise exception 'CRITERIO_NON_VALIDO';
      end;
      if v_t::date < current_date - 1 or v_t::date > current_date + 1095 then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_pulito := jsonb_build_object('entro', v_t);
    elsif v_chiave = 'classeEnergetica' then
      if v_valore is null or jsonb_typeof(v_valore) <> 'object' or jsonb_typeof(v_valore -> 'classe') is distinct from 'string' or not ((v_valore ->> 'classe') = any (v_classi)) then raise exception 'CRITERIO_NON_VALIDO'; end if;
      v_pulito := jsonb_build_object('classe', v_valore ->> 'classe');
    else
      raise exception 'CRITERIO_NON_VALIDO';
    end if;

    v_righe := v_righe || jsonb_build_array(jsonb_build_object('chiave', v_chiave, 'necessaria', v_necessaria, 'peso', v_peso, 'valore', v_pulito));
  end loop;

  -- ---- tutto valido: si scrive (una sola transazione) ----
  update tenant_profiles
     set tipologia = v_tipologia,
         budget_min = v_bmin, budget_max = v_bmax,
         locali_min = v_lmin, locali_max = v_lmax,
         mq_min = v_qmin, mq_max = v_qmax,
         updated_at = now()
   where profile_id = v_uid;

  delete from tenant_zone_interesse where tenant_id = v_uid;
  insert into tenant_zone_interesse (tenant_id, zona, luogo_id)
  select distinct on (public.luogo_etichetta(u.id)) v_uid, public.luogo_etichetta(u.id), u.id
    from unnest(v_luoghi) as u(id);

  delete from tenant_interessi where tenant_id = v_uid;
  insert into tenant_interessi (tenant_id, attributo_key, peso, necessaria, valore)
  select v_uid, r ->> 'chiave', (r ->> 'peso')::integer, (r -> 'necessaria')::boolean, case when jsonb_typeof(r -> 'valore') = 'null' then null else r -> 'valore' end
    from jsonb_array_elements(v_righe) as r;
end;
$$;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

revoke all on function public.salva_ricerca_inquilino(jsonb) from public, anon;
grant execute on function public.salva_ricerca_inquilino(jsonb) to authenticated;
revoke all on function public.ricerca_intero(jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public.luoghi_controlla_genitore() from public, anon, authenticated;
revoke all on function public.listings_imposta_luogo() from public, anon, authenticated;
grant execute on function public.luogo_etichetta(uuid) to authenticated;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select livello, count(*) from luoghi group by livello order by 1;   -- 2 province, 2 città, ~57 quartieri

-- annunci e zone già collegati a un luogo (gli altri restano come sono)
select (select count(*) from listings where luogo_id is not null) as annunci_collegati,
       (select count(*) from listings where luogo_id is null) as annunci_senza_luogo,
       (select count(*) from tenant_zone_interesse where luogo_id is not null) as zone_collegate,
       (select count(*) from tenant_zone_interesse where luogo_id is null) as zone_senza_luogo;
