"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ContrattoConAnnuncio, StatoContratto } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconDocumento } from "@/components/icons";

const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

const STATO_BADGE: Record<StatoContratto, string> = {
  bozza: "is-off",
  in_firma: "is-wait",
  firmato: "is-match",
  concluso: "is-off",
};

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

  return (
    <PageContainer wide>
      <h1 className="screen-title">Gestione affitto</h1>
      <p className="screen-sub">
        Contratto e bollette della casa che stai affittando, tutto in un posto.
      </p>

      {/* ---- I tuoi contratti ---- */}
      <div className="pref-label">
        <span>
          I tuoi contratti {contratti.length > 0 && `· ${contratti.length}`}
        </span>
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
        contratti.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelezionato(c)}
            className="match-card"
          >
            <div className="mc-avatar">
              {(c.candidature?.listings?.titolo ?? "IM").slice(0, 2).toUpperCase()}
            </div>
            <div className="mc-body">
              <div className="mc-zona">{c.candidature?.listings?.zona ?? ""}</div>
              <div className="mc-title">
                {c.candidature?.listings?.titolo ?? "Immobile"}
              </div>
              <div className="mc-meta">
                {c.canone ? `€${c.canone.toLocaleString("it-IT")}/mese` : "—"}
              </div>
            </div>
            <div className={`mc-pct ${STATO_BADGE[c.stato]}`}>
              {STATO_LABEL[c.stato]}
            </div>
          </button>
        ))
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
          <p>Stato attivazioni e prossime scadenze.</p>
          <span className="pv-readmore">Vedi le bollette</span>
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
              <span className={`mc-pct ${STATO_BADGE[selezionato.stato]}`}>
                {STATO_LABEL[selezionato.stato]}
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
        <p className="sheet-sub">
          Luce, gas e internet della casa in affitto: qui vedrai stato
          attivazioni, importi e scadenze.
        </p>
        <div className="empty-inline" style={{ padding: "30px 10px" }}>
          <IconDocumento className="icon-empty" />
          <h3>Nessuna utenza attiva ancora</h3>
          <p>
            Attiva luce, gas e internet nella tua nuova casa e da qui potrai
            seguire importi e scadenze delle bollette.
          </p>
        </div>
        <button className="opp-cta">Attiva luce, gas e internet</button>
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
