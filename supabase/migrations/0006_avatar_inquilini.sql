-- ============================================================
-- MatchAmI — foto profilo dell'inquilino
--
-- Aggiunge:
--   1. la colonna `avatar_url` su tenant_profiles
--   2. il bucket Storage "avatar-inquilini" con le sue policy
--
-- Il bucket segue lo stesso schema di "immobili-foto" (migrazione 0005):
-- pubblico in lettura, scrittura consentita solo dentro una cartella
-- che ha come nome l'id dell'utente.
--
-- NOTA SULLA PRIVACY: il bucket è pubblico, quindi chi conosce l'URL
-- vede la foto anche senza account. Il percorso contiene un UUID casuale,
-- quindi non è indovinabile, ma non è nemmeno protetto da autenticazione.
-- È lo stesso compromesso già adottato per le foto degli annunci. Se per
-- le foto delle persone preferisci una tutela maggiore, in fondo al file
-- trovi cosa cambierebbe.
--
-- NOTA: la parte "storage" funziona solo su un progetto Supabase vero,
-- non su un Postgres locale.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonna sulla tabella del profilo inquilino
-- ------------------------------------------------------------

alter table tenant_profiles
  add column if not exists avatar_url text;

-- ------------------------------------------------------------
-- 2. Bucket Storage
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatar-inquilini', 'avatar-inquilini', true)
on conflict (id) do nothing;

-- Lettura: aperta. Serve perché il proprietario deve vedere la foto di
-- chi si è candidato, e perché il bucket pubblico è servito via CDN.
create policy "avatar-inquilini: lettura pubblica" on storage.objects
  for select using (bucket_id = 'avatar-inquilini');

-- Scrittura: solo nella propria cartella, cioè "<uid>/nomefile.jpg".
create policy "avatar-inquilini: upload nella propria cartella" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatar-inquilini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar-inquilini: aggiorna nella propria cartella" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatar-inquilini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar-inquilini: elimina dalla propria cartella" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatar-inquilini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- Verifica
-- ------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_name = 'tenant_profiles' and column_name = 'avatar_url';

select id, name, public from storage.buckets where id = 'avatar-inquilini';


-- ============================================================
-- SE IN FUTURO VUOI RENDERE LE FOTO PRIVATE
--
-- 1. update storage.buckets set public = false where id = 'avatar-inquilini';
-- 2. sostituisci la policy di lettura con una che consenta l'accesso solo
--    al diretto interessato e ai proprietari con una candidatura in corso;
-- 3. lato app, invece di salvare l'URL pubblico, genera una signed URL
--    con `supabase.storage.from(...).createSignedUrl(percorso, secondi)`
--    nelle pagine server che mostrano la foto (profilo/page.tsx e
--    database/page.tsx). In `avatar_url` salveresti il percorso e non
--    l'indirizzo completo.
-- ============================================================
