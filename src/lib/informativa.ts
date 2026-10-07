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

/**
 * Questa persona ha accettato la versione in vigore?
 *
 * Se la domanda al database non riesce si risponde NO: la schermata di
 * accettazione compare invece di lasciar passare. Meglio fermare qualcuno
 * per un errore che lasciar usare l'app a chi non ha accettato.
 */
export async function haAccettatoInformativa(
  supabase: Supabase,
  userId: string,
  versione: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("accettazioni_informativa")
    .select("versione")
    .eq("user_id", userId)
    .eq("versione", versione)
    .maybeSingle();

  if (error) {
    console.error("haAccettatoInformativa: la lettura non è riuscita:", error.message);
    return false;
  }
  return data !== null;
}

/** Quando ha accettato la versione in vigore, se l'ha fatto. */
export async function dataAccettazione(
  supabase: Supabase,
  userId: string,
  versione: string
): Promise<string | null> {
  const { data } = await supabase
    .from("accettazioni_informativa")
    .select("accettata_at")
    .eq("user_id", userId)
    .eq("versione", versione)
    .maybeSingle();
  return (data?.accettata_at as string | undefined) ?? null;
}
