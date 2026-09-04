"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function candidati(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase.from("candidature").insert({
    listing_id: listingId,
    tenant_id: user.id,
    status: "in_attesa",
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/candidature");
  return { ok: true };
}
