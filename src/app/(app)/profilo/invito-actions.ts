"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type InvitoState = {
  error?: string;
  ok?: boolean;
  /** link da condividere, restituito subito dopo la creazione */
  link?: string;
} | null;

/** Codice segreto del link: 32 caratteri esadecimali. */
function nuovoToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function origine(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// ------------------------------------------------------------

export async function creaInvito(
  _prevState: InvitoState,
  formData: FormData
): Promise<InvitoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const nome_proprietario = String(formData.get("nome_proprietario") || "").trim();
  const email_proprietario =
    String(formData.get("email_proprietario") || "").trim().toLowerCase() || null;
  const indirizzo = String(formData.get("indirizzo") || "").trim() || null;
  const periodo = String(formData.get("periodo") || "").trim() || null;

  if (!nome_proprietario) {
    return { error: "Scrivi almeno il nome del proprietario." };
  }
  if (email_proprietario && !email_proprietario.includes("@")) {
    return { error: "L'email non sembra valida." };
  }

  const token = nuovoToken();

  const { error } = await supabase.from("inviti_proprietario").insert({
    tenant_id: user.id,
    token,
    nome_proprietario,
    email_proprietario,
    indirizzo,
    periodo,
  });

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true, link: `${await origine()}/invito/${token}` };
}

// ------------------------------------------------------------

export async function annullaInvito(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("inviti_proprietario")
    .update({ stato: "annullato" })
    .eq("id", id)
    .eq("tenant_id", user.id)
    .eq("stato", "inviato"); // un invito già completato non si tocca

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}

// ------------------------------------------------------------

export type RecensioneState = { error?: string; ok?: boolean } | null;

/** Messaggi leggibili per gli errori sollevati dalla funzione SQL. */
const MESSAGGI: Record<string, string> = {
  NON_AUTENTICATO: "Devi accedere per lasciare il feedback.",
  VOTO_NON_VALIDO: "Scegli un voto da 1 a 5.",
  INVITO_INESISTENTE: "Questo link non è valido.",
  INVITO_NON_PIU_VALIDO:
    "Questo invito è già stato usato o è stato annullato.",
  NON_PROPRIETARIO:
    "Il tuo account è registrato come inquilino. Per lasciare un feedback serve un account proprietario.",
  AUTO_INVITO: "Non puoi rispondere a un invito che hai creato tu.",
};

export async function completaInvito(
  _prevState: RecensioneState,
  formData: FormData
): Promise<RecensioneState> {
  const supabase = await createClient();

  const token = String(formData.get("token") || "");
  const voto = Number(formData.get("voto") || 0);
  const tag = formData.getAll("tag").map(String);

  if (!voto) return { error: "Scegli un voto da 1 a 5." };

  const { error } = await supabase.rpc("completa_invito", {
    p_token: token,
    p_voto: voto,
    p_tag: tag,
  });

  if (error) {
    const chiave = Object.keys(MESSAGGI).find((k) => error.message.includes(k));
    return { error: chiave ? MESSAGGI[chiave] : error.message };
  }

  revalidatePath("/profilo");
  return { ok: true };
}
