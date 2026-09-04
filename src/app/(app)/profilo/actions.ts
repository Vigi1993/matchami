"use server";

import { revalidatePath } from "next/cache";
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
  const garante = parseBool(formData.get("garante"));
  const protestato = parseBool(formData.get("protestato"));
  const fideiussione = parseBool(formData.get("fideiussione"));
  const animali = parseBool(formData.get("animali"));
  const nucleo = String(formData.get("nucleo") || "") || null;
  const figli = Number(formData.get("figli") || 0);
  const redditi_nucleo = Number(formData.get("redditi_nucleo") || 1);
  const presentazione = String(formData.get("presentazione") || "");

  const { error } = await supabase
    .from("tenant_profiles")
    .update({
      professione,
      reddito_mensile,
      garante,
      protestato,
      fideiussione,
      animali,
      nucleo,
      figli,
      redditi_nucleo,
      presentazione,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}

export async function updateRicerca(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const budget_max = Number(formData.get("budget_max") || 0);
  const locali_min = Number(formData.get("locali_min") || 1);
  const mq_min = Number(formData.get("mq_min") || 25);

  let zone: string[] = [];
  let interessi: Record<string, number> = {};
  try {
    zone = JSON.parse(String(formData.get("zone") || "[]"));
  } catch {
    zone = [];
  }
  try {
    interessi = JSON.parse(String(formData.get("interessi") || "{}"));
  } catch {
    interessi = {};
  }

  const { error: eProfile } = await supabase
    .from("tenant_profiles")
    .update({
      budget_max,
      locali_min,
      mq_min,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);
  if (eProfile) return { error: eProfile.message };

  // Zone: sostituiamo tutta la lista (semplice e corretto per un set piccolo)
  const { error: eDelZone } = await supabase
    .from("tenant_zone_interesse")
    .delete()
    .eq("tenant_id", user.id);
  if (eDelZone) return { error: eDelZone.message };

  if (zone.length > 0) {
    const { error: eInsZone } = await supabase
      .from("tenant_zone_interesse")
      .insert(zone.map((zona) => ({ tenant_id: user.id, zona })));
    if (eInsZone) return { error: eInsZone.message };
  }

  // Interessi: stessa logica, sostituiamo tutto
  const { error: eDelInt } = await supabase
    .from("tenant_interessi")
    .delete()
    .eq("tenant_id", user.id);
  if (eDelInt) return { error: eDelInt.message };

  const entries = Object.entries(interessi).filter(([, peso]) => peso > 0);
  if (entries.length > 0) {
    const { error: eInsInt } = await supabase.from("tenant_interessi").insert(
      entries.map(([attributo_key, peso]) => ({
        tenant_id: user.id,
        attributo_key,
        peso,
      }))
    );
    if (eInsInt) return { error: eInsInt.message };
  }

  revalidatePath("/profilo");
  return { ok: true };
}
