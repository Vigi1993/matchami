import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_RECUPERO } from "@/lib/recupero";
import { ResetClient } from "./ResetClient";

export default async function ResetPasswordPage() {
  const archivio = await cookies();

  // Si arriva qui solo dal link ricevuto per email, passando dalla
  // callback. Chi ha una semplice sessione aperta, o nessuna, torna
  // all'accesso: vedi lib/recupero.ts per il perché.
  if (!archivio.get(COOKIE_RECUPERO)) {
    redirect(
      `/login?errore=${encodeURIComponent(
        "Il link per reimpostare la password non è più valido. Richiedine uno nuovo."
      )}`
    );
  }

  return <ResetClient />;
}
