"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function updateDatiProprietario(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const proprietario_tipo = String(formData.get("proprietario_tipo") || "") || null;
  const num_immobili = Number(formData.get("num_immobili") || 1);
  const obiettivo = String(formData.get("obiettivo") || "") || null;

  const { error } = await supabase
    .from("owner_profiles")
    .update({
      proprietario_tipo,
      num_immobili,
      obiettivo,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}
