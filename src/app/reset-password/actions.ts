"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_RECUPERO } from "@/lib/recupero";
import { validaNuovaPassword } from "@/lib/password";

export type ResetState = { error?: string } | null;

const LINK_NON_VALIDO =
  "Il link per reimpostare la password non è più valido. Richiedine uno nuovo.";

export async function impostaNuovaPassword(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const archivio = await cookies();

  // Senza il segno lasciato dalla callback non si è arrivati da un link di
  // recupero: cambiare la password così aggirerebbe la richiesta della
  // password attuale (vedi lib/recupero.ts).
  if (!archivio.get(COOKIE_RECUPERO)) return { error: LINK_NON_VALIDO };

  const nuova = String(formData.get("password_nuova") || "");
  const ripeti = String(formData.get("password_ripeti") || "");

  const errore = validaNuovaPassword(nuova, ripeti);
  if (errore) return { error: errore };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: LINK_NON_VALIDO };

  const { error } = await supabase.auth.updateUser({ password: nuova });
  if (error) return { error: error.message };

  // Il link vale una volta sola: il segno si toglie subito.
  archivio.delete(COOKIE_RECUPERO);
  redirect("/");
}
