import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Chi sta guardando è staff?
 *
 * Si chiede al database (`is_staff()`), che risponde solo per chi la chiama.
 * Se la chiamata fallisce per qualunque motivo la risposta è NO: un errore
 * non deve mai aprire il pannello.
 */
export async function eStaff(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_staff");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Da chiamare in OGNI pagina e azione dello staff, non solo nel layout: in
 * Next layout e pagina si caricano in parallelo, e le azioni si possono
 * richiamare da sole. Per chi non è staff risponde 404, come se la pagina
 * non esistesse, invece di un "vietato" che ne rivela l'esistenza.
 */
export async function richiediStaff() {
  const supabase = await createClient();
  if (!(await eStaff(supabase))) notFound();
  return supabase;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function èUuid(valore: string): boolean {
  return UUID.test(valore);
}
