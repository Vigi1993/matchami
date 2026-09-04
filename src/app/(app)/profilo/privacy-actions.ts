"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function updatePrivacy(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const consenso_marketing = formData.get("consenso_marketing") === "true";
  const consenso_terzi = formData.get("consenso_terzi") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ consenso_marketing, consenso_terzi })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}
