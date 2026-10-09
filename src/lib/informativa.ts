import type { createClient } from "@/lib/supabase/server";

/**
 * La forma di una versione dell'informativa: aaaa-mm-<parola>[-<parola>...],
 * in minuscolo. È la stessa regola della migrazione 0017: un test controlla
 * che le due coincidano.
 */
export const REGOLA_VERSIONE = /^[0-9]{4}-[0-9]{2}(-[a-z0-9]+)+$/;

export function versioneValida(versione: string): boolean {
  return versione.length <= 60 && REGOLA_VERSIONE.test(versione);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Le versioni che valgono come «accettata»: quella in vigore e quelle equivalenti. */
export function versioniAccettabili(informativa: {
  versione: string;
  equivalenti?: readonly string[];
}): string[] {
  return [...new Set([informativa.versione, ...(informativa.equivalenti ?? [])])];
}

/**
 * Questa persona ha accettato la versione in vigore, o una equivalente?
 *
 * Se la domanda al database non riesce si risponde NO: la schermata di
 * accettazione compare invece di lasciar passare. Meglio fermare qualcuno
 * per un errore che lasciar usare l'app a chi non ha accettato.
 *
 * ATTENZIONE: si legge con `limit(1)`, NON con `maybeSingle()`. Chi ha accettato
 * più versioni equivalenti ha più righe, e `maybeSingle()` dà errore quando ne
 * trova più di una: l'errore vale «non accettata», e la persona verrebbe
 * fermata proprio perché ha accettato più volte.
 */
export async function haAccettatoInformativa(
  supabase: Supabase,
  userId: string,
  versioni: string | readonly string[]
): Promise<boolean> {
  const lista = typeof versioni === "string" ? [versioni] : [...versioni];
  const { data, error } = await supabase
    .from("accettazioni_informativa")
    .select("versione")
    .eq("user_id", userId)
    .in("versione", lista)
    .limit(1);

  if (error) {
    console.error("haAccettatoInformativa: la lettura non è riuscita:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Quando ha accettato (la versione in vigore o una equivalente: la più recente), se l'ha fatto. */
export async function dataAccettazione(
  supabase: Supabase,
  userId: string,
  versioni: string | readonly string[]
): Promise<string | null> {
  const lista = typeof versioni === "string" ? [versioni] : [...versioni];
  const { data } = await supabase
    .from("accettazioni_informativa")
    .select("accettata_at")
    .eq("user_id", userId)
    .in("versione", lista)
    .order("accettata_at", { ascending: false })
    .limit(1);
  return (Array.isArray(data) && (data[0]?.accettata_at as string | undefined)) || null;
}
