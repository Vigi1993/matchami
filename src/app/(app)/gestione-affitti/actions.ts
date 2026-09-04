"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function creaContratto(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const candidaturaId = String(formData.get("candidatura_id") || "");
  if (!candidaturaId) return { error: "Candidatura non trovata." };

  const canone = Number(formData.get("canone") || 0) || null;
  const durata_mesi = Number(formData.get("durata_mesi") || 0) || null;
  const data_inizio = String(formData.get("data_inizio") || "") || null;
  const stato = String(formData.get("stato") || "bozza");

  const { error } = await supabase.from("contratti").insert({
    candidatura_id: candidaturaId,
    stato,
    canone,
    durata_mesi,
    data_inizio,
  });

  if (error) return { error: error.message };

  revalidatePath("/gestione-affitti");
  return { ok: true };
}

export async function aggiornaContratto(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Contratto non trovato." };

  const canone = Number(formData.get("canone") || 0) || null;
  const durata_mesi = Number(formData.get("durata_mesi") || 0) || null;
  const data_inizio = String(formData.get("data_inizio") || "") || null;
  const data_firma = String(formData.get("data_firma") || "") || null;
  const stato = String(formData.get("stato") || "bozza");

  const { error } = await supabase
    .from("contratti")
    .update({
      stato,
      canone,
      durata_mesi,
      data_inizio,
      data_firma,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/gestione-affitti");
  return { ok: true };
}
