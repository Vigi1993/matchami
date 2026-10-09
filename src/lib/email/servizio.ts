/**
 * Il collegamento tra l'invio e il mondo vero: il database (con la chiave di
 * servizio) e il fornitore scelto nella configurazione. SOLO codice del server:
 * la chiave di servizio non deve mai finire nel browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAmministratore } from "@/lib/supabase/admin";
import { fornitoreEmail } from "./index";
import { eseguiInvio, type Deposito, type RigaReclamata, type RiepilogoInvio } from "./invio";

/** Le tre operazioni sul database che l'invio chiede, con le funzioni riservate al ruolo di servizio. */
export function depositoDaSupabase(admin: SupabaseClient): Deposito {
  return {
    async reclama(max) {
      const { data, error } = await admin.rpc("reclama_notifiche_email", { p_max_utenti: max });
      if (error) {
        // solo il motivo tecnico: nessun dato delle persone passa da qui
        console.error("reclama_notifiche_email:", error.message);
        return { ok: false, errore: error.message };
      }
      return { ok: true, righe: (data ?? []) as RigaReclamata[] };
    },
    async annulla(idNotifiche, definitivo) {
      const { error } = await admin.rpc("annulla_invio_email", { p_notifiche: idNotifiche, p_definitivo: definitivo });
      if (error) throw new Error(error.message);
    },
    async registra(e) {
      const { error } = await admin.rpc("registra_esito_email", {
        p_user: e.userId,
        p_fornitore: e.fornitore,
        p_esito: e.esito,
        p_n: e.n,
        p_errore: e.errore ?? null,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Esegue un giro di invio con la configurazione dell'ambiente. Se manca la chiave di
 * servizio o il fornitore non è configurato bene, si ferma e lo dice (senza toccare
 * nessuna notifica).
 */
export async function eseguiInvioDaAmbiente(urlApp: string): Promise<RiepilogoInvio> {
  const vuoto = { utenti: 0, notifiche: 0, inviate: 0, fallite: 0 };

  const admin = clienteAmministratore();
  if (!admin) return { ...vuoto, fermato: "La chiave di servizio non è configurata." };

  let fornitore;
  try {
    fornitore = fornitoreEmail(process.env.EMAIL_PROVIDER, {
      depositaProva: async (userId, oggetto, testo) => {
        const { error } = await admin.rpc("deposita_email_di_prova", { p_user: userId, p_oggetto: oggetto, p_testo: testo });
        if (error) throw new Error(error.message);
      },
    });
  } catch (e) {
    return { ...vuoto, fermato: e instanceof Error ? e.message : "Fornitore di email non configurato." };
  }

  return eseguiInvio({ deposito: depositoDaSupabase(admin), fornitore, urlApp });
}
