import { testiIntro, type Ruolo } from "@/lib/benvenuto-testi";

/**
 * La pagina «Come funziona» all'inizio del percorso: cosa vuol dire match, cosa vuol dire affidabilità (con i punti e le fasce vere) e perché contano i documenti.
 * Breve ma completa: pochi paragrafi per blocco. I numeri vengono dalle stesse costanti del punteggio (lib/benvenuto-testi.ts).
 */
export function IntroBenvenuto({ ruolo }: { ruolo: Ruolo }) {
  const t = testiIntro(ruolo);
  return (
    <div className="intro-benvenuto">
      {t.blocchi.map((b) => (
        <section key={b.id} className={`intro-blocco intro-${b.id}`} aria-labelledby={`intro-${b.id}`}>
          <h2 id={`intro-${b.id}`} className="intro-titolo">
            {b.titolo}
          </h2>
          {b.paragrafi.map((p, i) => (
            <p key={i} className="intro-testo">
              {p}
            </p>
          ))}
          {b.voci && (
            <ul className="intro-voci" aria-label="Cosa dà o toglie punti">
              {b.voci.map((v) => (
                <li key={v.etichetta} className={v.tono}>
                  <span>{v.etichetta}</span>
                  <b>{v.valore}</b>
                </li>
              ))}
            </ul>
          )}
          {b.fasce && (
            <ul className="intro-fasce" aria-label="Le fasce di affidabilità">
              {b.fasce.map((f) => (
                <li key={f.etichetta}>
                  <b>{f.etichetta}</b>
                  <span>{f.intervallo}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
