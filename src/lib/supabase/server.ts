import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase da usare in Server Component, Server Action e Route Handler.
 * Legge/scrive i cookie di sessione per sapere chi è l'utente loggato lato server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll chiamato da un Server Component: si può ignorare
            // se c'è un middleware che rinfresca la sessione (vedi middleware.ts)
          }
        },
      },
    }
  );
}
