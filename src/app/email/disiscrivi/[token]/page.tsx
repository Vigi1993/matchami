import { tokenValido } from "@/lib/email/modello";
import { disiscrivi } from "./actions";

/**
 * Dove porta il link «Smetti di riceverle» nell'email. Pubblica: chi la apre può non
 * avere un account attivo in questo browser. Aprirla NON disattiva niente: serve un
 * clic di conferma (un antivirus che apre i link da solo non deve disiscrivere nessuno).
 */
export default async function DisiscriviPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ esito?: string }>;
}) {
  const { token } = await params;
  const { esito } = await searchParams;
  const valido = tokenValido(token);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px" }}>
      <h1 className="screen-title">Email di MatchAmI</h1>

      {!valido ? (
        <div className="note-box is-no" role="alert">
          Questo link non è valido. Puoi gestire le email dall&apos;app, in Novità.
        </div>
      ) : esito === "fatto" ? (
        <div className="note-box" role="status">
          <b>Fatto.</b> Non riceverai più email per le novità. Puoi riattivarle quando vuoi dalla pagina Novità dell&apos;app.
        </div>
      ) : (
        <>
          <p className="screen-sub">Vuoi smettere di ricevere le email con le novità del tuo account?</p>
          {esito === "errore" && (
            <div className="note-box is-no" role="alert">
              Non è stato possibile completare l&apos;operazione. Riprova tra poco.
            </div>
          )}
          <form action={disiscrivi.bind(null, token)}>
            <button type="submit" className="opp-cta">
              Sì, smetti di mandarmele
            </button>
          </form>
          <p className="field-note" style={{ marginTop: 14 }}>
            Le novità resteranno comunque nell&apos;app. Potrai riattivare le email in qualsiasi momento.
          </p>
        </>
      )}
    </div>
  );
}
