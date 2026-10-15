import { stelleTesto, testoRecensioni } from "@/lib/recensioni";
import { BadgeRaccomandato } from "@/components/BadgeRaccomandato";
import { classeMatch, type DatiScheda } from "@/lib/database-proprietario";

/**
 * La scheda di una persona nel Database del proprietario (candidata o possibile match): in alto le due cifre che contano,
 * AFFIDABILITÀ e MATCH; sotto la foto, il nome, il lavoro e le informazioni; in fondo i pulsanti. Solo disegno: non decide niente.
 * Pensata per chi non è pratico: caratteri da 15 px in su, cifre grandi, un'azione principale evidente.
 */
export function SchedaPersona({
  dati,
  stato,
  onApri,
  children,
}: {
  dati: DatiScheda;
  /** una frase in alto a destra: «Match fatto», «Scartato», «Richiesta inviata»… */
  stato?: { testo: string; tono: "ok" | "neutro" | "no" } | null;
  /** apre la scheda completa */
  onApri?: () => void;
  /** i pulsanti */
  children?: React.ReactNode;
}) {
  const iniziale = dati.nome.slice(0, 1).toUpperCase() || "?";
  const m = dati.match;
  return (
    <article className="persona" aria-label={dati.nome}>
      {stato && <div className={`persona-stato is-${stato.tono}`}>{stato.testo}</div>}

      {/* ---- in alto: affidabilità e match ---- */}
      <div className="persona-cifre">
        <div className="cifra">
          <span className="cifra-numero">{dati.affidabilita === null ? "–" : dati.affidabilita}</span>
          <span className="cifra-nome">Affidabilità</span>
        </div>
        <div className={`cifra cifra-match ${m.tipo === "pct" ? classeMatch(m.valore) : m.tipo === "bloccato" ? "is-alert" : "is-nessuno"}`}>
          <span className="cifra-numero">{m.tipo === "pct" ? `${m.valore}%` : m.tipo === "bloccato" ? "No" : "–"}</span>
          <span className="cifra-nome">{m.tipo === "bloccato" ? "Manca un requisito" : m.tipo === "nessuno" ? "Match (nessun criterio)" : "Match"}</span>
        </div>
      </div>

      {/* ---- sotto: foto e informazioni ---- */}
      <div className="persona-testa">
        {dati.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dati.avatarUrl} alt="" className="persona-foto" />
        ) : (
          <span className="persona-foto persona-iniziale" aria-hidden="true">
            {iniziale}
          </span>
        )}
        <div className="persona-chi">
          <b>{dati.nome}</b>
          {dati.professione && <span>{dati.professione}</span>}
        </div>
      </div>

      <div className="persona-etichette">
        {dati.raccomandato && <BadgeRaccomandato />}
        {dati.redditoVerificato && <span className="persona-chip">Reddito verificato</span>}
        {dati.recensioni && dati.recensioni.numero > 0 && (
          <span className="persona-chip">
            <span aria-hidden="true">{stelleTesto(dati.recensioni.media)}</span> {testoRecensioni(dati.recensioni)}
          </span>
        )}
        {dati.incompleto && <span className="persona-chip">Dati incompleti</span>}
      </div>

      {m.tipo === "bloccato" && m.mancanti.length > 0 && <p className="persona-avviso">Non soddisfa: {m.mancanti.join(", ")}.</p>}
      {dati.presentazione && <p className="persona-presentazione">{dati.presentazione}</p>}

      {children && <div className="persona-azioni">{children}</div>}
      {onApri && (
        <button type="button" className="persona-dettagli" onClick={onApri}>
          Vedi la scheda completa ›
        </button>
      )}
    </article>
  );
}
