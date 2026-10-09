"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { richiediStaff } from "@/lib/staff";
import { indirizzoBase } from "@/lib/email/modello";
import { eseguiInvioDaAmbiente } from "@/lib/email/servizio";
import type { RiepilogoInvio } from "@/lib/email/invio";

export type EsitoInvioManuale = { riepilogo: RiepilogoInvio } | { error: string } | null;

/**
 * Fa partire un giro di invio a mano. Serve finché non c'è uno scheduler, e per
 * provare tutto il percorso. Solo lo staff: si controlla PRIMA di fare qualunque cosa.
 */
export async function eseguiInvioManuale(): Promise<EsitoInvioManuale> {
  await richiediStaff();

  // l'indirizzo dell'app per i link: quello configurato, o quello da cui si sta chiamando
  let urlApp = process.env.APP_URL ?? "";
  if (!indirizzoBase(urlApp)) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    urlApp = host ? `${proto}://${host}` : "";
  }

  const riepilogo = await eseguiInvioDaAmbiente(urlApp);
  revalidatePath("/staff/email");
  return { riepilogo };
}
