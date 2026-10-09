import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/invito" è pubblico: il proprietario che riceve il link non ha
// ancora un account quando lo apre.
// "/email/disiscrivi" e "/api/email": la disiscrizione dal link nell'email e l'invio periodico non hanno
// una sessione. Ognuno si protegge da sé: la prima con un codice lungo e casuale (e un clic di conferma),
// il secondo con un segreto che solo lo scheduler conosce.
const PUBLIC_PATHS = ["/login", "/auth", "/invito", "/rapporto", "/informativa", "/email/disiscrivi", "/api/email/"];

/**
 * Rinfresca il token di sessione Supabase ad ogni richiesta e protegge
 * le rotte private: senza sessione si viene rimandati a /login, con
 * sessione attiva non si può tornare su /login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: non rimuovere. Rinfresca il token scaduto.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // ricorda dove stava andando, così dopo l'accesso ci torna
    loginUrl.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (user && path === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}
