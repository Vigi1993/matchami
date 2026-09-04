-- ============================================================
-- MatchAmI — Fase 4/rifiniture: upload foto reale via Supabase Storage
--
-- NOTA IMPORTANTE: questa migrazione usa lo schema "storage" che esiste
-- solo su un progetto Supabase vero, non su un Postgres qualunque — non
-- ho potuto testarla sul mio Postgres locale come le altre. Segue però
-- lo schema standard documentato da Supabase per gli upload "una cartella
-- per utente", verificalo comunque dopo averlo eseguito (prova a caricare
-- una foto da Immobili).
-- ============================================================

-- Bucket pubblico: le foto degli annunci devono essere visibili a chiunque
-- navighi il portale, anche senza account.
insert into storage.buckets (id, name, public)
values ('immobili-foto', 'immobili-foto', true)
on conflict (id) do nothing;

-- Lettura: aperta a tutti (il bucket è pubblico, ma la policy esplicita
-- serve comunque per le richieste autenticate lato client).
create policy "immobili-foto: lettura pubblica" on storage.objects
  for select using (bucket_id = 'immobili-foto');

-- Scrittura: ogni proprietario può caricare solo dentro una cartella con
-- il proprio user id come primo segmento del percorso (es. "<uid>/foto.jpg").
create policy "immobili-foto: upload nella propria cartella" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "immobili-foto: aggiorna nella propria cartella" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "immobili-foto: elimina dalla propria cartella" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
