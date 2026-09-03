import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase da usare SOLO nei Client Component (file con "use client").
 * Usa la chiave anon: sicura da esporre al browser, la sicurezza vera
 * è garantita dalle policy RLS definite in supabase/migrations/0001_init.sql.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
