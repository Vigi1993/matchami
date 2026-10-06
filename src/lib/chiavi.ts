/**
 * Lettura e controllo della chiave di servizio di Supabase.
 *
 * Supabase ha introdotto un nuovo sistema di chiavi e sta dismettendo le
 * vecchie `anon` e `service_role` (entro fine 2026):
 *   - chiave SEGRETA   `sb_secret_...`       (server, ignora la sicurezza di riga)
 *   - chiave PUBBLICA  `sb_publishable_...`  (browser, rispetta la sicurezza di riga)
 *   - vecchie, in formato JWT (cominciano con `eyJ`): `service_role` e `anon`
 *
 * Il rischio che questo file evita: incollare per sbaglio la chiave
 * PUBBLICA al posto di quella segreta. La finestra "Connect" del pannello
 * mostra quella pubblica per prima. Con la chiave sbagliata la cancellazione
 * dell'account fallirebbe in modo oscuro, perché la sicurezza di riga la
 * bloccherebbe senza dire perché.
 */

export type EsitoChiave =
  | { ok: true; chiave: string; tipo: "segreta" | "service_role_legacy" }
  | { ok: false; motivo: string };

function leggiRuoloJwt(chiave: string): string | null {
  const parti = chiave.split(".");
  if (parti.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parti[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Dice se una stringa è una chiave utilizzabile come chiave di servizio. */
export function controllaChiaveDiServizio(valore: string | null | undefined): EsitoChiave {
  const chiave = (valore ?? "").trim();
  if (!chiave) return { ok: false, motivo: "chiave assente" };

  if (chiave.startsWith("sb_secret_")) {
    return { ok: true, chiave, tipo: "segreta" };
  }
  if (chiave.startsWith("sb_publishable_")) {
    return {
      ok: false,
      motivo:
        "è la chiave PUBBLICA (sb_publishable_...): serve quella SEGRETA (sb_secret_...)",
    };
  }
  if (chiave.startsWith("eyJ")) {
    const ruolo = leggiRuoloJwt(chiave);
    if (ruolo === "service_role") return { ok: true, chiave, tipo: "service_role_legacy" };
    if (ruolo === "anon") {
      return {
        ok: false,
        motivo: "è la vecchia chiave anon, pubblica: serve la chiave segreta",
      };
    }
    return { ok: false, motivo: "chiave JWT con un ruolo non riconosciuto" };
  }
  return { ok: false, motivo: "formato non riconosciuto: la chiave segreta comincia con sb_secret_" };
}

/**
 * Trova la chiave di servizio nelle variabili d'ambiente.
 *
 * `SUPABASE_SECRET_KEY` è il nome ufficiale. `SUPABASE_SERVICE_ROLE_KEY`
 * resta valido per chi aveva già impostato quello (le vecchie chiavi
 * funzionano finché Supabase non le disattiva).
 */
export function chiaveDiServizioDaAmbiente(
  env: Record<string, string | undefined>
): EsitoChiave {
  const candidata = env.SUPABASE_SECRET_KEY?.trim()
    ? env.SUPABASE_SECRET_KEY
    : env.SUPABASE_SERVICE_ROLE_KEY;
  return controllaChiaveDiServizio(candidata);
}
