"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ContrattoConAnnuncio } from "@/lib/types";
import { LinkUtenze } from "@/components/LinkUtenze";
import { SOTTOTITOLO_UTENZE } from "@/lib/utenze";
import {
  NESSUN_CONTRATTO_IN_CORSO,
  badgeStato,
  etichettaStato,
  raggruppaContratti,
} from "@/lib/contratti";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconDocumento } from "@/components/icons";

function formatData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GestioneClient({
  contratti,
}: {
  contratti: ContrattoConAnnuncio[];
}) {
  const [selezionato, setSelezionato] = useState<ContrattoConAnnuncio | null>(
    null
  );
  const [bolletteAperto, setBolletteAperto] = useState(false);

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
              <div className="pref-label" style={{ marginTop: 12 }}>
                <span>In corso — {inCorso.length}</span>
              </div>
              <div className="card-grid">
                {inCorso.map((c) => (
                  <SchedaContratto key={c.id} c={c} onSelect={setSelezionato} />
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
              <div className="card-grid">
                {storico.map((c) => (
                  <SchedaContratto key={c.id} c={c} onSelect={setSelezionato} passato />
                ))}
              </div>
            </>
          )}
        </>
      )}

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

      {/* ---- Sheet: dettaglio contratto ---- */}
      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={selezionato?.candidature?.listings?.titolo ?? "Contratto"}
      >
        {selezionato && (
          <>
            <div className="mb-4">
              <span className={`mc-pct ${badgeStato(selezionato.stato)}`}>
                {etichettaStato(selezionato.stato)}
              </span>
            </div>
            <DettaglioRow
              label="Zona"
              value={selezionato.candidature?.listings?.zona ?? "—"}
            />
            <DettaglioRow
              label="Canone mensile"
              value={
                selezionato.canone
                  ? `€${selezionato.canone.toLocaleString("it-IT")}`
                  : "—"
              }
            />
            <DettaglioRow
              label="Durata"
              value={
                selezionato.durata_mesi ? `${selezionato.durata_mesi} mesi` : "—"
              }
            />
            <DettaglioRow
              label="Data inizio"
              value={formatData(selezionato.data_inizio)}
            />
            <DettaglioRow
              label="Data firma"
              value={formatData(selezionato.data_firma)}
            />
          </>
        )}
      </Sheet>

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

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feat-row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

/** La scheda di un contratto nell'elenco. Quelle dello storico sono attenuate, come le candidature chiuse. */
function SchedaContratto({
  c,
  onSelect,
  passato = false,
}: {
  c: ContrattoConAnnuncio;
  onSelect: (c: ContrattoConAnnuncio) => void;
  passato?: boolean;
}) {
  return (
    <button onClick={() => onSelect(c)} className="match-card" style={passato ? { opacity: 0.55 } : undefined}>
      <div className="mc-avatar">{(c.candidature?.listings?.titolo ?? "IM").slice(0, 2).toUpperCase()}</div>
      <div className="mc-body">
        <div className="mc-zona">{c.candidature?.listings?.zona ?? ""}</div>
        <div className="mc-title">{c.candidature?.listings?.titolo ?? "Immobile"}</div>
        <div className="mc-meta">{c.canone ? `€${c.canone.toLocaleString("it-IT")}/mese` : "—"}</div>
      </div>
      <div className={`mc-pct ${badgeStato(c.stato)}`}>{etichettaStato(c.stato)}</div>
    </button>
  );
}
