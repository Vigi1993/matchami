"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import { messaggioErroreVerifica } from "@/lib/verifica";

import { importiDaForm } from "@/lib/verifica-importi";
export type EsitoState = { error?: string } | null;

/**
 * Verifica o respinge un immobile. Il controllo dei permessi sta in tre
 * posti: qui, nel layout, e soprattutto nella funzione del database, che
 * risponde NON_STAFF a chiunque non lo sia. Questa azione si può chiamare
 * da sola, senza passare dalla pagina.
 */
export async function decidiVerifica(
  _prev: EsitoState,
  formData: FormData
): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Immobile non valido." };
  if (esito !== "verifica" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("NOTA_OBBLIGATORIA") };
  }

  const { error } = await supabase.rpc("esito_verifica_immobile", {
    p_listing: id,
    p_verificato: esito === "verifica",
    p_note: esito === "respingi" ? nota : null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  revalidatePath("/");
  redirect("/staff");
}

/**
 * Verifica o respinge un rapporto di locazione già confermato dalle due
 * parti. Stessi controlli di `decidiVerifica`: permessi qui, nel layout e
 * nella funzione del database.
 */
export async function decidiRapporto(
  _prev: EsitoState,
  formData: FormData
): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Affitto non valido." };
  if (esito !== "verifica" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("NOTA_OBBLIGATORIA") };
  }

  const { error } = await supabase.rpc("esito_rapporto", {
    p_rapporto: id,
    p_verificato: esito === "verifica",
    p_note: esito === "respingi" ? nota : null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  redirect("/staff");
}

/**
 * Verifica o respinge il reddito di un inquilino. Stessi controlli delle
 * altre due: permessi qui, nel layout e nella funzione del database.
 */
export async function decidiInquilino(
  _prev: EsitoState,
  formData: FormData
): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Inquilino non valido." };
  if (esito !== "verifica" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("INQUILINO_NOTA_OBBLIGATORIA") };
  }

  // Verificare = scrivere QUANTO dimostra ogni prova del reddito (uno per documento riconosciuto): lo si controlla qui, prima del database
  let importi: { documento: string; importo: number }[] | null = null;
  if (esito === "verifica") {
    const [{ data: docs }, { data: datiRows }] = await Promise.all([
      supabase.from("documenti_inquilino").select("id, persona, nome_file").eq("tenant_id", id).eq("tipo", "reddito").is("verificato_at", null),
      supabase.rpc("dati_per_verifica_inquilino", { p_tenant: id }),
    ]);
    const redditiNucleo = ((datiRows ?? [])[0] as { redditi_nucleo?: number | null } | undefined)?.redditi_nucleo ?? null;
    const valori: Record<string, string> = {};
    for (const [chiave, valore] of formData.entries()) if (chiave.startsWith("importo-")) valori[chiave.slice("importo-".length)] = String(valore);
    const letti = importiDaForm({
      documenti: (docs ?? []).map((d) => ({ id: d.id as string, persona: (d.persona as number | null) ?? 1, nome: d.nome_file as string })),
      valori,
      redditiNucleo,
    });
    if (!letti.ok) return { error: letti.errore };
    importi = letti.importi;
  }

  const { error } = await supabase.rpc("esito_verifica_inquilino", {
    p_tenant: id,
    p_verificato: esito === "verifica",
    p_note: esito === "respingi" ? nota : null,
    p_importi: importi,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  redirect("/staff");
}

/**
 * Lo staff dà l'esito sui protesti di un inquilino: «nessun_protesto», «protestato» oppure «respingi» (con una nota). Il risultato dello staff PREVALE su ciò che la
 * persona aveva dichiarato. I permessi stanno qui, nel layout e nella funzione del database (NON_STAFF per chiunque non lo sia).
 */
export async function decidiProtesti(_prev: EsitoState, formData: FormData): Promise<EsitoState> {
  const supabase = await richiediStaff();

  const id = String(formData.get("id") || "");
  const esito = String(formData.get("esito") || "");
  const nota = String(formData.get("nota") || "").trim();

  if (!èUuid(id)) return { error: "Inquilino non valido." };
  if (esito !== "nessun_protesto" && esito !== "protestato" && esito !== "respingi") return { error: "Scelta non valida." };
  if (esito === "respingi" && nota.length < 3) {
    return { error: messaggioErroreVerifica("PROTESTI_NOTA_OBBLIGATORIA") };
  }

  const { error } = await supabase.rpc("esito_verifica_protesti", {
    p_tenant: id,
    p_esito: esito,
    p_note: esito === "respingi" ? nota : null,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/staff");
  redirect("/staff");
}
