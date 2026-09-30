"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

function parseAttributi(raw: FormDataEntryValue | null): Record<string, boolean> {
  try {
    const obj = JSON.parse(String(raw || "{}"));
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** Le foto arrivano dal modulo come array JSON di URL, già ordinate. */
function parseFoto(valore: FormDataEntryValue | null): string[] {
  try {
    const v = JSON.parse(String(valore || "[]"));
    return Array.isArray(v) ? v.filter((u) => typeof u === "string" && u) : [];
  } catch {
    return [];
  }
}

export async function creaImmobile(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const titolo = String(formData.get("titolo") || "").trim();
  const zona = String(formData.get("zona") || "").trim();
  const prezzo = Number(formData.get("prezzo") || 0);
  if (!titolo || !zona || !prezzo) {
    return { error: "Titolo, zona e canone sono obbligatori." };
  }

  const descrizione = String(formData.get("descrizione") || "") || null;
  const locali = Number(formData.get("locali") || 0) || null;
  const mq = Number(formData.get("mq") || 0) || null;
  const attributi = parseAttributi(formData.get("attributi"));
  const pubblicato = formData.get("pubblicato") === "true";
  const foto = parseFoto(formData.get("foto"));

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      owner_id: user.id,
      titolo,
      descrizione,
      zona,
      prezzo,
      locali,
      mq,
      attributi,
      pubblicato,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (foto.length > 0 && listing) {
    const { error: eFoto } = await supabase.from("listing_photos").insert(
      foto.map((url, i) => ({ listing_id: listing.id, url, ordine: i }))
    );
    if (eFoto) return { error: eFoto.message };
  }

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}

export async function aggiornaImmobile(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Immobile non trovato." };

  const titolo = String(formData.get("titolo") || "").trim();
  const zona = String(formData.get("zona") || "").trim();
  const prezzo = Number(formData.get("prezzo") || 0);
  if (!titolo || !zona || !prezzo) {
    return { error: "Titolo, zona e canone sono obbligatori." };
  }

  const descrizione = String(formData.get("descrizione") || "") || null;
  const locali = Number(formData.get("locali") || 0) || null;
  const mq = Number(formData.get("mq") || 0) || null;
  const attributi = parseAttributi(formData.get("attributi"));
  const pubblicato = formData.get("pubblicato") === "true";
  const foto = parseFoto(formData.get("foto"));

  const { error } = await supabase
    .from("listings")
    .update({
      titolo,
      descrizione,
      zona,
      prezzo,
      locali,
      mq,
      attributi,
      pubblicato,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  // Riscriviamo l'intera galleria: l'ordine delle foto è quello in cui
  // il proprietario le ha lasciate nel modulo.
  const { error: eDel } = await supabase
    .from("listing_photos")
    .delete()
    .eq("listing_id", id);
  if (eDel) return { error: eDel.message };

  if (foto.length > 0) {
    const { error: eFoto } = await supabase.from("listing_photos").insert(
      foto.map((url, i) => ({ listing_id: id, url, ordine: i }))
    );
    if (eFoto) return { error: eFoto.message };
  }

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}

export async function eliminaImmobile(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // Non permettiamo di eliminare un immobile che ha già candidature:
  // cancellarlo cancellerebbe a cascata anche quelle (e gli eventuali
  // contratti collegati). Meglio nascondere l'annuncio in quel caso.
  const { count } = await supabase
    .from("candidature")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);

  if (count && count > 0) {
    return {
      error:
        "Questo annuncio ha già delle candidature: non può essere eliminato, ma puoi nasconderlo (Non pubblicato).",
    };
  }

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}
