-- ============================================================
-- MatchAmI — Fase 4 (lato proprietario): il proprietario deve poter
-- leggere nome/cognome degli inquilini che si sono candidati ai suoi
-- annunci. La policy "tenant_profiles: owner reads applicants" già lo
-- permetteva per i dati economici; qui aggiungiamo lo stesso per la
-- tabella "profiles" (dove stanno nome/cognome).
-- ============================================================

create policy "profiles: owner reads applicant profile" on profiles
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.tenant_id = profiles.id
        and l.owner_id = auth.uid()
    )
  );
