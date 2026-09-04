-- ============================================================
-- MatchAmI — Fase 5: chat realtime
-- ============================================================

-- L'inquilino deve poter leggere nome/cognome del proprietario, ma solo
-- dopo che una sua candidatura è stata accettata (prima non ha motivo
-- di conoscere l'identità del proprietario).
create policy "profiles: tenant reads owner after match" on profiles
  for select using (
    exists (
      select 1 from listings l
      join candidature c on c.listing_id = l.id
      where l.owner_id = profiles.id
        and c.tenant_id = auth.uid()
        and c.status = 'accettata'
    )
  );

-- Abilita le notifiche realtime sulla tabella messaggi (necessario perché
-- i messaggi compaiano istantaneamente nella chat, senza dover ricaricare
-- la pagina).
alter publication supabase_realtime add table messaggi;
