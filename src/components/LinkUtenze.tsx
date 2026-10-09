import {
  AVVISO_ESEMPIO,
  CATALOGO_UTENZE,
  ETICHETTA_SPONSORIZZATO,
  NOTA_LINK_ESTERNI,
  haEsempi,
  raggruppaPerCategoria,
  type LinkUtenza,
} from "@/lib/utenze";

/**
 * I collegamenti ai fornitori di luce, gas e internet. Sono semplici link: niente
 * codice che registri i clic, e il sito del fornitore non riceve da dove arrivi
 * (`noreferrer`). Finché sono link di esempio lo dice, in alto.
 */
export function LinkUtenze({ catalogo = CATALOGO_UTENZE }: { catalogo?: readonly LinkUtenza[] }) {
  const gruppi = raggruppaPerCategoria(catalogo);

  if (gruppi.length === 0) {
    return <p className="field-note">Nessun fornitore disponibile al momento.</p>;
  }

  return (
    <div className="utenze-link">
      {haEsempi(catalogo) && (
        <div className="note-box" style={{ marginTop: 0 }}>
          {AVVISO_ESEMPIO}
        </div>
      )}

      {gruppi.map((g) => (
        <section key={g.id} aria-label={g.etichetta}>
          <div className="pref-label" style={{ marginTop: 16 }}>
            <span>{g.etichetta}</span>
          </div>
          <ul className="utenze-lista">
            {g.link.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="utenza-link">
                  <span className="utenza-nome">
                    {l.nome}
                    {l.sponsorizzato && <span className="utenza-sponsor">{ETICHETTA_SPONSORIZZATO}</span>}
                  </span>
                  <span className="utenza-desc">{l.descrizione}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="field-note" style={{ marginTop: 14 }}>
        {NOTA_LINK_ESTERNI}
      </p>
    </div>
  );
}
