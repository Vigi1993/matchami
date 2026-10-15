"use server";

import { MESSAGGIO_PROTESTI_OBBLIGATORI } from "@/lib/affidabilita";
import { revalidatePath } from "next/cache";
import { messaggioErroreVerifica } from "@/lib/verifica";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

function parseBool(v: FormDataEntryValue | null): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export async function updateDatiPersonali(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const professione = String(formData.get("professione") || "") || null;
  const redditoRaw = formData.get("reddito_mensile");
  const reddito_mensile = redditoRaw ? Number(redditoRaw) : null;
  // Lo slider parte da 0 e 0 vuol dire "non indicato": chi non lo tocca non
  // ha dichiarato di non avere reddito.
  const redditoNucleoRaw = Number(formData.get("reddito_nucleo") || 0);
  const reddito_nucleo =
    Number.isFinite(redditoNucleoRaw) && redditoNucleoRaw > 0
      ? Math.round(redditoNucleoRaw)
      : null;
  const garante = parseBool(formData.get("garante"));
  const protestato = parseBool(formData.get("protestato"));
  const fideiussione = parseBool(formData.get("fideiussione"));
  const animali = parseBool(formData.get("animali"));
  const nucleo = String(formData.get("nucleo") || "") || null;
  const figli = Number(formData.get("figli") || 0);
  const redditi_nucleo = Number(formData.get("redditi_nucleo") || 1);
  const presentazione = String(formData.get("presentazione") || "");
  // stringa vuota = nessuna foto, così l'inquilino può anche rimuoverla
  const avatar_url = String(formData.get("avatar_url") || "").trim() || null;

  // La risposta sui protesti è obbligatoria: senza, varrebbe come «sì» e toglierebbe punti senza che la persona lo sappia.
  if (protestato === null) return { error: MESSAGGIO_PROTESTI_OBBLIGATORI };

  const { error } = await supabase
    .from("tenant_profiles")
    .update({
      professione,
      reddito_mensile,
      reddito_nucleo,
      garante,
      protestato,
      fideiussione,
      animali,
      nucleo,
      figli,
      redditi_nucleo,
      presentazione,
      avatar_url,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  revalidatePath("/"); // la Home ricalcola il punteggio di affidabilità
  return { ok: true };
}

export async function updateRicerca(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // La ricerca arriva come un unico oggetto: la valida e la salva il database, tutta insieme (o niente).
  const grezzo = String(formData.get("ricerca") ?? "");
  if (grezzo.length === 0 || grezzo.length > 30000) return { error: messaggioErroreVerifica("RICERCA_NON_VALIDA") };
  let ricerca: unknown;
  try {
    ricerca = JSON.parse(grezzo);
  } catch {
    return { error: messaggioErroreVerifica("RICERCA_NON_VALIDA") };
  }

  const { error } = await supabase.rpc("salva_ricerca_inquilino", { p_ricerca: ricerca });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/profilo");
  revalidatePath("/"); // la Home ricalcola il mazzo con la ricerca nuova
  return { ok: true };
}
