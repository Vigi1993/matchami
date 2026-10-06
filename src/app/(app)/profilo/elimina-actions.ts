"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clienteAmministratore } from "@/lib/supabase/admin";
import { passwordCorretta } from "@/lib/supabase/password";
import {
  CONFERMA_ELIMINAZIONE,
  confermaEliminazioneValida,
  eliminaFileUtente,
} from "@/lib/account";

export type EliminaState = { error?: string } | null;

/**
 * Elimina l'account di chi sta chiedendo, con tutto ciò che ne consegue
 * (vedi supabase/migrations/0010_cancellazione_account.sql per cosa
 * sparisce e cosa resta).
 *
 * Si agisce SEMPRE sull'utente autenticato, mai su un id ricevuto dal
 * modulo: questa azione usa la chiave di servizio, che può cancellare
 * chiunque.
 */
export async function eliminaAccount(
  _prevState: EliminaState,
  formData: FormData
): Promise<EliminaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Non autenticato." };

  if (!confermaEliminazioneValida(String(formData.get("conferma") || ""))) {
    return { error: `Per confermare scrivi ${CONFERMA_ELIMINAZIONE}.` };
  }

  // Come per cambiare email o password: chi trovasse una sessione aperta
  // non può cancellare l'account senza conoscere la password.
  const password = String(formData.get("password_attuale") || "");
  if (!password) return { error: "Inserisci la tua password per confermare." };
  if (!(await passwordCorretta(user.email, password))) {
    return { error: "Password non corretta." };
  }

  const admin = clienteAmministratore();
  if (!admin) {
    console.error("eliminaAccount: SUPABASE_SERVICE_ROLE_KEY non configurata");
    return {
      error:
        "L'eliminazione dell'account non è ancora attiva su questo ambiente.",
    };
  }

  // La libreria in certi casi LANCIA un'eccezione invece di restituire un
  // errore (per esempio se l'id non è un UUID): senza questo riparo la
  // persona vedrebbe una pagina d'errore invece di un messaggio.
  try {
    // 1. I file prima: se falliscono l'account resta intatto e si può riprovare.
    const erroreFile = await eliminaFileUtente(admin, user.id);
    if (erroreFile) return { error: erroreFile };

    // 2. L'utente: il database porta via a cascata il resto.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error("eliminaAccount: deleteUser:", error.message);
      return { error: "Non è stato possibile eliminare l'account. Riprova tra poco." };
    }
  } catch (e) {
    console.error("eliminaAccount:", e);
    return { error: "Non è stato possibile eliminare l'account. Riprova tra poco." };
  }

  // 3. La sessione locale. signOut parla con un server che non conosce più
  // l'utente e può rispondere con un errore: i cookie si tolgono comunque.
  await supabase.auth.signOut().catch(() => undefined);
  const archivio = await cookies();
  for (const c of archivio.getAll()) {
    if (c.name.startsWith("sb-") || c.name === "recupero_password") {
      archivio.delete(c.name);
    }
  }

  redirect("/login?eliminato=1");
}
