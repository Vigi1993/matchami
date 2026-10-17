import { AVVISO_CONFERMA_SALTATA, confermaEmailSaltata } from "@/lib/test-iscrizione";

/**
 * Finché l'interruttore di prova è acceso (SALTA_CONFERMA_EMAIL=1, vedi lib/test-iscrizione.ts) la pagina di accesso lo dice a chiunque la guardi,
 * così non si dimentica. Spento, non si vede niente.
 */
// La pagina NON deve essere preparata una volta sola quando si costruisce l'app: l'interruttore si legge ogni volta che qualcuno la apre,
// altrimenti accenderlo dopo (come si fa nei test) non farebbe comparire l'avviso.
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {confermaEmailSaltata() && (
        <div className="avviso-prova" role="status">
          {AVVISO_CONFERMA_SALTATA}
        </div>
      )}
      {children}
    </>
  );
}
