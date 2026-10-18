import { AvatarPersona } from "@/components/database/AvatarPersona";
import { BadgeRaccomandato } from "@/components/BadgeRaccomandato";
import { CLASSE_ESITO, CLASSE_STATO, CLASSE_TESSERA } from "@/components/database/classi";
import { IconCheck, IconIndietro, IconX } from "@/components/icons";
import {
  CRITERI_ORDINE,
  ETICHETTE_STATO_VOCE,
  NOMI_CRITERI,
  cifraCriterio,
  parolaCriterio,
  pienezzaCriterio,
  type CriterioOrdine,
  type VoceElenco,
} from "@/lib/database-elenco";
import type { CasaDatabase } from "@/lib/database-proprietario";
import { testoPrezzo } from "@/lib/proprietario/home";
import { stelleTesto, testoRecensioni } from "@/lib/recensioni";
import type { Ref } from "react";

const SIMBOLO = { ok: "✓", no: "–", non_indicato: "?" } as const;

type Esito = "si" | "no" | "nd";

/**
 * Il dettaglio di una persona: a quale immobile si riferisce, chi è, i tre numeri (affidabilità, match, recensioni, ognuno con il suo colore e
 * quello con cui si ordina segnato), cosa ha verificato lo staff, quali dei criteri scelti dal proprietario rispetta, e le azioni. Sul computer sta
 * accanto all'elenco; sul telefono si apre a tutto schermo (`modale`). Solo disegno: le azioni arrivano già pronte.
 */
export function DettaglioPersona({
  voce,
  casa,
  criterio,
  azioni,
  modale,
  onChiudi,
  chiudiRif,
}: {
  voce: VoceElenco;
  casa: CasaDatabase;
  /** il criterio con cui si sta ordinando: il suo riquadro è segnato */
  criterio: CriterioOrdine;
  /** i pulsanti giusti per lo stato della persona */
  azioni: React.ReactNode;
  /** aperto a tutto schermo (telefono): ha il pulsante per tornare all'elenco */
  modale: boolean;
  onChiudi: () => void;
  chiudiRif?: Ref<HTMLButtonElement>;
}) {
  const s = voce.scheda;
  const c = voce.candidatura;
  const v = c?.valutazione;
  const zona = casa.zona.replace(", Milano", "");

  return (
    <section
      className={`db-dettaglio ${modale ? "modale" : ""}`}
      role={modale ? "dialog" : undefined}
      aria-modal={modale ? true : undefined}
      aria-label={`Scheda di ${s.nome}`}
    >
      <button type="button" className="db-chiudi" ref={chiudiRif} onClick={onChiudi}>
        <IconIndietro className="db-chiudi-icona" />
        Torna all&apos;elenco
      </button>

      {/* ---- per quale immobile ---- */}
      <div className="db-immobile">
        {casa.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={casa.foto} alt="" className="db-foto db-foto-piccola" />
        ) : (
          <span className="db-foto db-foto-piccola db-foto-vuota" aria-hidden="true">
            {casa.titolo.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="db-immobile-chi">
          <span className="db-immobile-etichetta">{c ? "Candidato per" : "Possibile match per"}</span>
          <span className="db-immobile-titolo">
            {casa.titolo} · {zona}
            {casa.prezzo ? ` · ${testoPrezzo(casa.prezzo)}` : ""}
          </span>
        </span>
        <span className={`db-stato-pillola ${CLASSE_STATO[voce.stato]}`}>{ETICHETTE_STATO_VOCE[voce.stato]}</span>
      </div>

      {/* ---- chi è ---- */}
      <div className="db-persona">
        <AvatarPersona scheda={s} grande />
        <div className="db-persona-chi">
          <h2 className="db-persona-nome">{s.nome}</h2>
          {s.professione && <p className="db-persona-lavoro">{s.professione}</p>}
          <div className="db-etichette">
            {s.raccomandato && <BadgeRaccomandato />}
            {s.redditoVerificato && <span className="persona-chip">Reddito verificato</span>}
            {s.protestiVerificati === "nessuno" && <span className="persona-chip">Nessun protesto · verificato</span>}
            {s.protestiVerificati === "si" && <span className="persona-chip persona-chip-attenzione">Ha protesti · verificato</span>}
            {s.recensioni && s.recensioni.numero > 0 && (
              <span className="persona-chip">
                <span aria-hidden="true">{stelleTesto(s.recensioni.media)}</span> {testoRecensioni(s.recensioni)}
              </span>
            )}
            {s.incompleto && <span className="persona-chip">Dati incompleti</span>}
          </div>
        </div>
      </div>

      {/* ---- i tre numeri, ognuno con il suo colore ---- */}
      <div className="db-tessere">
        {CRITERI_ORDINE.map((k) => {
          const scelto = k === criterio;
          return (
            <div key={k} className={`db-tessera ${CLASSE_TESSERA[k]} ${scelto ? "sel" : ""}`}>
              {scelto && (
                <span className="db-tag">
                  Ordinato<span className="solo-lettori"> per questo criterio</span>
                </span>
              )}
              <span className="db-corona" style={{ ["--p" as string]: pienezzaCriterio(s, k) }}>
                <b>{cifraCriterio(s, k)}</b>
              </span>
              <span className="db-tessera-testo">
                <span className="db-tessera-nome">{NOMI_CRITERI[k]}</span>
                <span className="db-tessera-sub">{parolaCriterio(s, k)}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* ---- verificato dallo staff · i criteri scelti ---- */}
      <div className="db-colonne">
        <div>
          <h3 className="db-sezione">Verificato dallo staff</h3>
          <Voce esito={s.redditoVerificato ? "si" : "nd"} titolo="Reddito" testo={s.redditoVerificato ? "Verificato sui documenti" : "Non verificato"} />
          <Voce
            esito={s.protestiVerificati === "nessuno" ? "si" : s.protestiVerificati === "si" ? "no" : "nd"}
            titolo="Protesti"
            testo={s.protestiVerificati === "nessuno" ? "Nessun protesto, certificato verificato" : s.protestiVerificati === "si" ? "Ci sono protesti, certificato verificato" : "Non ancora verificati dallo staff"}
          />
        </div>

        <div>
          <h3 className="db-sezione">Criteri che hai scelto per questa casa</h3>
          {v ? (
            v.match.punteggio === null && v.match.criteri.length === 0 ? (
              <p className="db-nota">Per questo annuncio non hai chiesto nessun criterio, quindi non c&apos;è una percentuale. Puoi aggiungerli da Immobili.</p>
            ) : (
              <>
                {v.match.bloccato && <div className="note-stop">Non soddisfa un criterio obbligatorio: {v.match.mancanti.join(", ")}.</div>}
                {v.match.criteri.map((k) => (
                  <Voce
                    key={k.chiave}
                    esito={k.stato === "ok" ? "si" : k.stato === "no" ? "no" : "nd"}
                    titolo={k.etichetta}
                    testo={k.dettaglio ?? (k.stato === "non_indicato" ? "Non indicato dal candidato" : k.stato === "ok" ? "Rispettato" : "Non rispettato")}
                    nota={k.obbligatorio ? "obbligatorio" : undefined}
                    simbolo={SIMBOLO[k.stato]}
                  />
                ))}
                {v.match.incompleto && !v.congelata && <p className="db-nota">Il candidato non ha indicato alcuni dati: se li compila, la percentuale può salire.</p>}
                <p className="db-nota">È una compatibilità sui dati dichiarati dal candidato, non una valutazione della persona né una previsione. {v.congelata ? "Fotografia al momento della tua decisione." : ""}</p>
              </>
            )
          ) : s.match.tipo === "pct" ? (
            <p className="db-nota">Il match è calcolato sui criteri che hai scelto per questa casa. Per i dettagli, la persona deve candidarsi.</p>
          ) : s.match.tipo === "bloccato" ? (
            <div className="note-stop">Non soddisfa: {s.match.mancanti.join(", ")}.</div>
          ) : (
            <p className="db-nota">Per questo annuncio non hai chiesto nessun criterio, quindi non c&apos;è una percentuale.</p>
          )}
        </div>
      </div>

      {/* ---- ciò che ha dichiarato (solo chi si è candidato: dei possibili non si vedono i redditi) ---- */}
      {c?.tenant_profiles && (
        <div className="db-dichiarati">
          <h3 className="db-sezione">Dichiarato dalla persona</h3>
          <Riga etichetta="Situazione lavorativa" valore={c.tenant_profiles.professione ?? "—"} />
          <Riga etichetta="Reddito dichiarato" valore={c.tenant_profiles.reddito_mensile ? `€${c.tenant_profiles.reddito_mensile.toLocaleString("it-IT")}/mese` : "—"} />
          <Riga etichetta="Reddito del nucleo" valore={c.tenant_profiles.reddito_nucleo ? `€${c.tenant_profiles.reddito_nucleo.toLocaleString("it-IT")}/mese` : "Non indicato"} />
        </div>
      )}

      {/* ---- presentazione ---- */}
      {(c?.tenant_profiles?.presentazione || s.presentazione) && (
        <div className="db-presentazione">
          <h3 className="db-sezione">Presentazione</h3>
          <p>{c?.tenant_profiles?.presentazione ?? s.presentazione}</p>
        </div>
      )}

      <div className="db-azioni">{azioni}</div>
    </section>
  );
}

function Voce({ esito, titolo, testo, nota, simbolo }: { esito: Esito; titolo: string; testo: string; nota?: string; simbolo?: string }) {
  return (
    <div className="db-voce">
      <span className={`db-esito ${CLASSE_ESITO[esito]}`} aria-hidden="true">
        {esito === "si" ? <IconCheck /> : esito === "no" ? <IconX /> : <span>{simbolo === "?" ? "?" : "–"}</span>}
      </span>
      <span className="db-voce-testo">
        <b>
          {titolo}
          {nota && <em className="tag-obbl">{nota}</em>}
        </b>
        <small>{testo}</small>
        <span className="solo-lettori">{esito === "si" ? "Sì" : esito === "no" ? "No" : "Non disponibile"}</span>
      </span>
    </div>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="feat-row">
      <span className="k">{etichetta}</span>
      <span className="v">{valore}</span>
    </div>
  );
}
