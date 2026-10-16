"use client";

import { ConfermaAffitto } from "@/components/ConfermaAffitto";
import { daConfermare } from "@/lib/affitto-contratto";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ContrattoConAnnuncio } from "@/lib/types";
import { LinkUtenze } from "@/components/LinkUtenze";
import { ContrattoInPagina } from "@/components/ContrattoInPagina";
import type { FirmeDelContratto } from "@/lib/firma/carica";
import type { DocumentoContratto } from "@/lib/documenti-contratto";
import { SOTTOTITOLO_UTENZE } from "@/lib/utenze";
import {
  MODO_STORICO,
  NESSUN_CONTRATTO_IN_CORSO,
  modoInCorso,
  raggruppaContratti,
} from "@/lib/contratti";
import { PageContainer } from "@/components/ui/PageContainer";
import { Row } from "@/components/ui/Row";
import { InvitaProprietarioSheet } from "@/components/InvitaProprietarioSheet";
import { IconDocumento, IconPersone } from "@/components/icons";
import type { Invito } from "@/lib/types";
import type { SezioneGestione } from "@/lib/gestione";

export function GestioneClient({
  contratti,
  documenti = {},
  firme = {},
  affittiPanel,
  inviti = [],
  nomeInquilino = null,
  aperturaIniziale = null,
}: {
  contratti: ContrattoConAnnuncio[];
  /** gli affitti dichiarati e le richieste di conferma, costruiti dal server */
  affittiPanel?: React.ReactNode;
  /** gli inviti mandati ai proprietari */
  inviti?: Invito[];
  nomeInquilino?: string | null;
  /** la scheda da aprire subito (da un collegamento o da una notifica) */
  aperturaIniziale?: SezioneGestione | null;
  /** le firme di prova dei miei contratti, per identificativo del contratto */
  firme?: Record<string, FirmeDelContratto>;
  /** i documenti dei miei contratti, per identificativo del contratto */
  documenti?: Record<string, DocumentoContratto[]>;
}) {
  const [bolletteAperto, setBolletteAperto] = useState(false);
  const [affittiAperto, setAffittiAperto] = useState(aperturaIniziale === "affitti");
  const [invitoAperto, setInvitoAperto] = useState(aperturaIniziale === "invito");

  // I contratti conclusi vanno nello storico: non restano mescolati a quelli in corso.
  const { inCorso, storico } = raggruppaContratti(contratti);

  return (
    <PageContainer wide>
      <h1 className="screen-title">Gestione affitto</h1>
      <p className="screen-sub">
        Contratto e bollette della casa che stai affittando, tutto in un posto.
      </p>

      {/* ---- I tuoi contratti ---- */}
      <div className="pref-label">
        <span>I tuoi contratti</span>
      </div>

      {/* il proprietario ha segnato un contratto «firmato»: l'inquilino conferma con un tocco che l'affitto è cominciato */}
      {contratti.filter(daConfermare).map((c) => (
        <ConfermaAffitto key={c.id} contratto={c} />
      ))}

      {contratti.length === 0 ? (
        <div className="empty-inline" style={{ paddingTop: 30 }}>
          <IconDocumento className="icon-empty" />
          <h3>Nessun contratto ancora</h3>
          <p>
            Quando un proprietario accetterà una tua candidatura, il contratto
            comparirà qui.
          </p>
        </div>
      ) : (
        <>
          {inCorso.length > 0 ? (
            <>
              {/* con più contratti in corso si dice quanti sono; con uno solo c'è solo il contratto */}
              {inCorso.length > 1 && (
                <div className="pref-label" style={{ marginTop: 12 }}>
                  <span>In corso — {inCorso.length}</span>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                {inCorso.map((c) => (
                  <ContrattoInPagina key={c.id} c={c} modo={modoInCorso(inCorso.length)} firme={firme[c.id]} documenti={documenti[c.id] ?? []} />
                ))}
              </div>
            </>
          ) : (
            <div className="note-box" style={{ marginTop: 12 }}>
              {NESSUN_CONTRATTO_IN_CORSO}
            </div>
          )}

          {storico.length > 0 && (
            <>
              <div className="pref-label" style={{ marginTop: 20 }}>
                <span>Storico — {storico.length}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                {storico.map((c) => (
                  <ContrattoInPagina key={c.id} c={c} modo={MODO_STORICO} firme={firme[c.id]} documenti={documenti[c.id] ?? []} passato />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ---- Affitti passati e recensioni: prima stavano nel Profilo ---- */}
      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Affitti e recensioni</span>
      </div>
      <Row
        color="var(--moss)"
        icon={<IconDocumento className="fill-none stroke-white stroke-2" />}
        title="Dichiara un affitto"
        subtitle="Hai già affittato una casa? Dichiara l'affitto con il suo contratto: se l'altra persona lo conferma e lo verifichiamo, il proprietario potrà lasciarti una recensione."
        cta="Dichiara o gestisci gli affitti"
        onClick={() => setAffittiAperto(true)}
      />
      <Row
        color="var(--gold)"
        icon={<IconPersone className="fill-none stroke-[var(--ink)] stroke-2" />}
        title="Invita il tuo proprietario"
        subtitle="Hai già una casa in affitto? Chiedi al tuo proprietario un commento su com'è andata: la recensione compare accanto al tuo punteggio di affidabilità."
        cta={inviti.some((i) => i.stato === "inviato") ? "Gestisci gli inviti" : "Manda l'invito"}
        onClick={() => setInvitoAperto(true)}
      />

      {/* ---- Bollette e utenze ---- */}
      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Bollette e utenze</span>
      </div>
      <button onClick={() => setBolletteAperto(true)} className="pv-row">
        <div
          className="pv-check"
          style={{ background: "var(--moss)", borderColor: "var(--moss)" }}
        >
          <IconDocumento className="fill-none stroke-white stroke-2" />
        </div>
        <div className="pv-text">
          <div className="pv-label-row">
            <b>Luce, gas e internet</b>
          </div>
          <p>{SOTTOTITOLO_UTENZE}</p>
          <span className="pv-readmore">Vedi i fornitori</span>
        </div>
      </button>

      {/* ---- Sheet: dichiara un affitto ---- */}
      <Sheet open={affittiAperto} onClose={() => setAffittiAperto(false)} title="I tuoi affitti">
        {affittiPanel}
      </Sheet>

      {/* ---- Sheet: invita il proprietario ---- */}
      <InvitaProprietarioSheet open={invitoAperto} onClose={() => setInvitoAperto(false)} nomeInquilino={nomeInquilino} inviti={inviti} />

      {/* ---- Sheet: bollette (demo) ---- */}
      <Sheet
        open={bolletteAperto}
        onClose={() => setBolletteAperto(false)}
        title="Bollette e utenze"
      >
        <p className="sheet-sub">{SOTTOTITOLO_UTENZE}</p>
        <LinkUtenze />
      </Sheet>
    </PageContainer>
  );
}
