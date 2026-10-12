-- ============================================================
-- MatchAmI — documenti del contratto (APE, planimetria, ricevute, registrazione)
--
-- Ogni contratto ha un archivio in cui CIASCUNA delle due parti carica documenti. Li
-- vedono entrambe; li cancella solo chi li ha caricati.
--
-- PRINCIPIO: l'archivio dei file NON concede mai a un utente di leggere i file di un
-- altro. Ognuno vede soltanto la propria cartella (`<id utente>/<file>`), come per i
-- documenti di verifica. Per far vedere un documento all'altra parte c'è UN solo punto:
-- il server, che prima chiede al database «sei una delle due parti?» (la funzione
-- `percorso_documento_contratto`) e solo allora scarica il file. Il controllo sta in un
-- posto solo.
--
-- Per questo i percorsi sono PIATTI, `<id utente>/<id>.<estensione>`: la cancellazione
-- dell'account elenca la cartella della persona e toglie ciò che trova a quel livello, e
-- una cartella annidata non verrebbe rimossa.
--
-- FILE ORFANI. Se un contratto sparisce (una delle parti cancella l'account, o l'immobile
-- viene eliminato) le righe dei documenti spariscono a cascata, ma i file stanno
-- nell'archivio e NON si cancellano da soli: resterebbero lì, dati personali senza
-- nessuna riga che li indichi. Un trigger accoda il percorso di OGNI riga cancellata, a
-- cascata compresa, in `file_da_eliminare`; il server la svuota (e un controllo
-- periodico la riprende se qualcosa è andato storto).
--
-- Le tabelle non hanno nessuna lettura diretta: solo funzioni, e quelle della coda solo
-- per il ruolo di servizio.
--
-- ORDINE: esegui questa migrazione PRIMA del push del codice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. L'archivio dei file: privato, 10 MB, solo PDF e immagini
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti-contratto', 'documenti-contratto', false,
  10485760,                                            -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- Solo la PROPRIA cartella: si carica, si legge (serve a controllare il file appena caricato)
-- e si cancella ciò che è proprio. Nessuna regola di lettura sui file degli altri.
drop policy if exists "documenti-contratto: carica nella propria cartella" on storage.objects;
create policy "documenti-contratto: carica nella propria cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documenti-contratto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documenti-contratto: legge i propri file" on storage.objects;
create policy "documenti-contratto: legge i propri file" on storage.objects
  for select to authenticated
  using (bucket_id = 'documenti-contratto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documenti-contratto: cancella i propri file" on storage.objects;
create policy "documenti-contratto: cancella i propri file" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documenti-contratto' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- 2. I documenti
-- ------------------------------------------------------------

create table if not exists documenti_contratto (
  id            uuid primary key default gen_random_uuid(),
  contratto_id  uuid not null references contratti(id) on delete cascade,
  caricato_da   uuid not null references profiles(id) on delete cascade,
  tipo          text not null check (tipo in ('ape', 'planimetria', 'ricevuta', 'registrazione', 'altro')),
  nome_file     text not null check (char_length(nome_file) between 1 and 200),
  -- <id utente>/<id>.<estensione>: piatto, nella cartella di chi ha caricato
  percorso      text not null unique
                check (percorso ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'),
  dimensione    integer not null check (dimensione between 1 and 10485760),
  tipo_file     text not null check (tipo_file in ('application/pdf', 'image/jpeg', 'image/png')),
  created_at    timestamptz not null default now(),
  -- l'estensione dice la stessa cosa del tipo del file
  constraint documenti_contratto_estensione_coerente check (
    (tipo_file = 'application/pdf' and percorso like '%.pdf')
    or (tipo_file = 'image/jpeg' and percorso like '%.jpg')
    or (tipo_file = 'image/png' and percorso like '%.png')
  )
);

create index if not exists documenti_contratto_per_contratto_idx on documenti_contratto (contratto_id);

alter table documenti_contratto enable row level security;
revoke all on documenti_contratto from anon, authenticated;

-- ------------------------------------------------------------
-- 3. La coda dei file da togliere dall'archivio
-- ------------------------------------------------------------

create table if not exists file_da_eliminare (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null check (char_length(bucket) between 1 and 80),
  percorso   text not null check (char_length(percorso) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (bucket, percorso)
);

alter table file_da_eliminare enable row level security;
revoke all on file_da_eliminare from anon, authenticated;

-- Ogni riga di documento che sparisce (anche a cascata) mette il suo file in coda.
create or replace function public.accoda_file_documento_contratto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into file_da_eliminare (bucket, percorso)
  values ('documenti-contratto', old.percorso)
  on conflict (bucket, percorso) do nothing;
  return old;
end;
$$;

drop trigger if exists documenti_contratto_accoda_file on documenti_contratto;
create trigger documenti_contratto_accoda_file
  after delete on documenti_contratto
  for each row execute function public.accoda_file_documento_contratto();

-- ------------------------------------------------------------
-- 4. Le funzioni per le due parti
--
-- «Una delle due parti» vuol dire: il proprietario dell'immobile o l'inquilino della
-- candidatura di quel contratto, e la candidatura è ACCETTATA. Per chiunque altro non c'è
-- niente, e nemmeno si capisce se il documento esiste.
-- ------------------------------------------------------------

-- I documenti di TUTTI i miei contratti, in una volta sola. Non restituisce il percorso del
-- file: quello lo dà solo `percorso_documento_contratto`, al momento di scaricare.
create or replace function public.documenti_dei_miei_contratti()
returns table (
  id           uuid,
  contratto_id uuid,
  tipo         text,
  nome_file    text,
  dimensione   integer,
  tipo_file    text,
  created_at   timestamptz,
  mio          boolean,
  da_ruolo     text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.contratto_id, d.tipo, d.nome_file, d.dimensione, d.tipo_file, d.created_at,
         d.caricato_da = auth.uid(),
         case when d.caricato_da = l.owner_id then 'locatore' else 'conduttore' end
    from documenti_contratto d
    join contratti c on c.id = d.contratto_id
    join candidature k on k.id = c.candidatura_id
    join listings l on l.id = k.listing_id
   where auth.uid() is not null
     and k.status = 'accettata'
     and (k.tenant_id = auth.uid() or l.owner_id = auth.uid())
   order by d.created_at desc;
$$;

-- Dove sta il file, per scaricarlo. L'UNICO punto in cui un'altra persona può arrivare a un
-- file: lo chiama il server, che poi lo scarica con i suoi permessi.
create or replace function public.percorso_documento_contratto(p_documento uuid)
returns table (contratto_id uuid, percorso text, nome_file text, tipo_file text)
language sql
stable
security definer
set search_path = public
as $$
  select d.contratto_id, d.percorso, d.nome_file, d.tipo_file
    from documenti_contratto d
    join contratti c on c.id = d.contratto_id
    join candidature k on k.id = c.candidatura_id
    join listings l on l.id = k.listing_id
   where auth.uid() is not null
     and d.id = p_documento
     and k.status = 'accettata'
     and (k.tenant_id = auth.uid() or l.owner_id = auth.uid());
$$;

-- Registra un documento GIÀ caricato nella cartella di chi chiama. Il server ha controllato il
-- contenuto del file (che sia davvero un PDF, un JPEG o un PNG) e ne ha letto la dimensione.
create or replace function public.registra_documento_contratto(
  p_contratto uuid,
  p_tipo text,
  p_percorso text,
  p_nome text,
  p_dimensione integer,
  p_tipo_file text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '[[:cntrl:]]+', ' ', 'g'));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  -- Il contratto si BLOCCA mentre si conta: due registrazioni insieme non possono superare il limite.
  perform 1
     from contratti c
     join candidature k on k.id = c.candidatura_id
     join listings l on l.id = k.listing_id
    where c.id = p_contratto
      and k.status = 'accettata'
      and (k.tenant_id = auth.uid() or l.owner_id = auth.uid())
      for update of c;
  if not found then
    raise exception 'CONTRATTO_NON_TUO';
  end if;

  if p_tipo is null or p_tipo not in ('ape', 'planimetria', 'ricevuta', 'registrazione', 'altro') then
    raise exception 'TIPO_DOCUMENTO_NON_VALIDO';
  end if;

  v_nome := btrim(regexp_replace(v_nome, '\s+', ' ', 'g'));
  if char_length(v_nome) not between 1 and 200 then
    raise exception 'NOME_FILE_NON_VALIDO';
  end if;

  -- il file deve stare nella cartella di chi chiama, con un nome che è un identificativo, e il suo
  -- tipo deve concordare con l'estensione; la dimensione deve essere quella ammessa
  if p_percorso is null
     or p_percorso !~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$')
     or p_tipo_file is null
     or not (
          (p_tipo_file = 'application/pdf' and p_percorso like '%.pdf')
       or (p_tipo_file = 'image/jpeg' and p_percorso like '%.jpg')
       or (p_tipo_file = 'image/png' and p_percorso like '%.png')
     )
     or p_dimensione is null or p_dimensione not between 1 and 10485760
  then
    raise exception 'FILE_NON_VALIDO';
  end if;

  if (select count(*) from documenti_contratto where contratto_id = p_contratto) >= 30 then
    raise exception 'TROPPI_DOCUMENTI';
  end if;

  begin
    insert into documenti_contratto (contratto_id, caricato_da, tipo, nome_file, percorso, dimensione, tipo_file)
    values (p_contratto, auth.uid(), p_tipo, v_nome, p_percorso, p_dimensione, p_tipo_file)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'FILE_NON_VALIDO';
  end;

  return v_id;
end;
$$;

-- Cancella un documento: solo chi lo ha caricato. Restituisce il percorso del file, così il
-- server può toglierlo subito dall'archivio (se non ci riesce, c'è la coda).
create or replace function public.elimina_documento_contratto(p_documento uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_percorso text;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO';
  end if;

  delete from documenti_contratto d
   where d.id = p_documento
     and d.caricato_da = auth.uid()
     and exists (
       select 1
         from contratti c
         join candidature k on k.id = c.candidatura_id
         join listings l on l.id = k.listing_id
        where c.id = d.contratto_id
          and k.status = 'accettata'
          and (k.tenant_id = auth.uid() or l.owner_id = auth.uid())
     )
  returning d.percorso into v_percorso;

  if v_percorso is null then
    raise exception 'DOCUMENTO_NON_TUO';
  end if;
  return v_percorso;
end;
$$;

-- ------------------------------------------------------------
-- 5. La coda, per il server (solo il ruolo di servizio)
-- ------------------------------------------------------------

create or replace function public.file_da_eliminare_elenco(p_max integer default 100)
returns table (id uuid, bucket text, percorso text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.bucket, f.percorso
    from file_da_eliminare f
   order by f.created_at
   limit least(greatest(coalesce(p_max, 100), 1), 500);
$$;

create or replace function public.file_eliminati(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from file_da_eliminare where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------

revoke all on function
  public.documenti_dei_miei_contratti(),
  public.percorso_documento_contratto(uuid),
  public.registra_documento_contratto(uuid, text, text, text, integer, text),
  public.elimina_documento_contratto(uuid)
from public, anon;

grant execute on function
  public.documenti_dei_miei_contratti(),
  public.percorso_documento_contratto(uuid),
  public.registra_documento_contratto(uuid, text, text, text, integer, text),
  public.elimina_documento_contratto(uuid)
to authenticated;

revoke all on function
  public.file_da_eliminare_elenco(integer),
  public.file_eliminati(uuid[]),
  public.accoda_file_documento_contratto()
from public, anon, authenticated;

grant execute on function
  public.file_da_eliminare_elenco(integer),
  public.file_eliminati(uuid[])
to service_role;

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select id, public from storage.buckets where id = 'documenti-contratto';   -- public deve essere false

select routine_name from information_schema.routines
where routine_name in ('documenti_dei_miei_contratti', 'percorso_documento_contratto', 'registra_documento_contratto',
                       'elimina_documento_contratto', 'file_da_eliminare_elenco', 'file_eliminati')
order by 1;   -- 6 righe

-- devono risultare 0: nessun permesso diretto sulle tabelle nuove
select count(*) as permessi_diretti_per_gli_utenti
from information_schema.role_table_grants
where table_name in ('documenti_contratto', 'file_da_eliminare') and grantee in ('authenticated', 'anon');
