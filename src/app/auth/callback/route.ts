import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { percorsoInterno } from "@/lib/percorso";
import {
  COOKIE_RECUPERO,
  DURATA_RECUPERO_SECONDI,
  messaggioErroreAccesso,
  PERCORSO_RESET,
} from "@/lib/recupero";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` arriva dall'esterno: senza controllo, "@evil.com" faceva
  // finire l'utente su un altro sito dopo l'accesso.
  const next = percorsoInterno(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const risposta = NextResponse.redirect(`${origin}${next}`);

      // Un link di recupero: la pagina di reset si apre solo con questo
      // segno, vedi lib/recupero.ts.
      if (next === PERCORSO_RESET) {
        risposta.cookies.set(COOKIE_RECUPERO, "1", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: DURATA_RECUPERO_SECONDI,
        });
      }
      return risposta;
    }
    // il messaggio tecnico resta nei log; alla persona va quello comprensibile
    console.error("auth/callback:", error.message);
    return NextResponse.redirect(
      `${origin}/login?errore=${encodeURIComponent(
        messaggioErroreAccesso(error.message)
      )}`
    );
  }

  // Un link scaduto o già usato arriva senza codice: Supabase mette
  // l'errore nel frammento dell'indirizzo, che il server non vede mai.
  return NextResponse.redirect(
    `${origin}/login?errore=${encodeURIComponent(
      "Il link non è valido o è scaduto. Richiedine uno nuovo."
    )}`
  );
}
