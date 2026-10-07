import { INFORMATIVA, SEGNAPOSTO } from "@/content/informativa";

/** Evidenzia i punti ancora da compilare, così non si possono scambiare per testo vero. */
function conSegnaposti(testo: string) {
  return testo.split(SEGNAPOSTO).flatMap((pezzo, i, tutti) =>
    i < tutti.length - 1
      ? [pezzo, <mark key={i} className="segnaposto">{SEGNAPOSTO}</mark>]
      : [pezzo]
  );
}

/** Il testo dell'informativa, dal file di contenuto. Serve a pagina e schermata di accettazione. */
export function TestoInformativa() {
  return (
    <div className="informativa-testo">
      {INFORMATIVA.provvisoria && (
        <div className="informativa-avviso" role="note">
          <b>Documento provvisorio.</b> {INFORMATIVA.avviso}
        </div>
      )}
      <h1>{INFORMATIVA.titolo}</h1>
      <p className="informativa-meta">
        Versione {INFORMATIVA.versione} · aggiornata a {INFORMATIVA.aggiornata}
      </p>

      {INFORMATIVA.sezioni.map((s) => (
        <section key={s.titolo}>
          <h2>{s.titolo}</h2>
          {"paragrafi" in s &&
            s.paragrafi?.map((p, i) => <p key={i}>{conSegnaposti(p)}</p>)}
          {"elenco" in s && s.elenco && (
            <ul>
              {s.elenco.map((voce, i) => (
                <li key={i}>{conSegnaposti(voce)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
