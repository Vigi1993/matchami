import { testiGuida, type Ruolo } from "@/lib/guida-testi";

/**
 * La pagina «Come funziona» che si rilegge dal Profilo: cosa vuol dire match, affidabilità e recensioni, per il ruolo di chi legge. Solo disegno: i testi e i
 * numeri vengono da lib/guida-testi.ts (che li prende dalle costanti del calcolo vero). Usa lo stile del benvenuto, così le due pagine sembrano la stessa.
 */
export function GuidaComeFunziona({ ruolo }: { ruolo: Ruolo }) {
  const t = testiGuida(ruolo);
  return (
    <div className="intro-benvenuto guida-pagina">
      {t.blocchi.map((b) => (
        <section key={b.id} className={`intro-blocco intro-${b.id}`} aria-labelledby={`guida-${b.id}`}>
          <h2 id={`guida-${b.id}`} className="intro-titolo">
            {b.titolo}
          </h2>
          {b.paragrafi.map((p, i) => (
            <p key={i} className="intro-testo">
              {p}
            </p>
          ))}
          {b.pesi && (
            <ul className="intro-voci" aria-label="Quanto pesa ogni parte del match">
              {b.pesi.map((v) => (
                <li key={v.etichetta} className="piu">
                  <span>{v.etichetta}</span>
                  <b>{v.valore}</b>
                </li>
              ))}
            </ul>
          )}
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
