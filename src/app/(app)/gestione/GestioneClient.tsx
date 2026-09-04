"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ContrattoConAnnuncio, StatoContratto } from "@/lib/types";

const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

const STATO_COLOR: Record<StatoContratto, string> = {
  bozza: "bg-ink/10 text-ink/60",
  in_firma: "bg-gold/20 text-[#8A6A25]",
  firmato: "bg-moss/15 text-moss",
  concluso: "bg-ink/10 text-ink/60",
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
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">Gestione affitto</h1>
      <p className="text-xs text-ink/50 mb-6">
        Contratto e bollette della casa che stai affittando, tutto in un
        posto.
      </p>

      {/* ---- I tuoi contratti ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi contratti {contratti.length > 0 && `· ${contratti.length}`}
      </div>

      {contratti.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-4 mb-6 text-xs text-ink/50">
          Nessun contratto ancora. Quando un proprietario accetterà una tua
          candidatura, il contratto comparirà qui.
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {contratti.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelezionato(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.candidature?.listings?.titolo ?? "Immobile"}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.stato]}`}
                >
                  {STATO_LABEL[c.stato]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.candidature?.listings?.zona ?? ""}
                {c.canone && ` · €${c.canone.toLocaleString("it-IT")}/mese`}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ---- Bollette e utenze ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        Bollette e utenze
      </div>
      <button
        onClick={() => setBolletteAperto(true)}
        className="w-full flex items-start gap-3 text-left bg-white border border-ink/10 rounded-2xl p-4"
      >
        <div className="w-9 h-9 rounded-full bg-moss shrink-0" />
        <div className="flex-1">
          <div className="font-display font-bold text-sm text-ink">
            Luce, gas e internet
          </div>
          <p className="text-xs text-ink/55 leading-snug">
            Stato attivazioni e prossime scadenze.
          </p>
          <span className="text-xs text-moss font-semibold">
            Vedi le bollette
          </span>
        </div>
      </button>

      {/* ---- Sheet: dettaglio contratto ---- */}
      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={selezionato?.candidature?.listings?.titolo ?? "Contratto"}
      >
        {selezionato && (
          <div className="flex flex-col gap-4">
            <span
              className={`self-start text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[selezionato.stato]}`}
            >
              {STATO_LABEL[selezionato.stato]}
            </span>
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
                selezionato.durata_mesi
                  ? `${selezionato.durata_mesi} mesi`
                  : "—"
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
          </div>
        )}
      </Sheet>

      {/* ---- Sheet: bollette (demo) ---- */}
      <Sheet
        open={bolletteAperto}
        onClose={() => setBolletteAperto(false)}
        title="Bollette e utenze"
      >
        <p className="text-xs text-ink/60 mb-5">
          Luce, gas e internet della casa in affitto: qui vedrai stato
          attivazioni, importi e scadenze.
        </p>
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-gold/20 mx-auto mb-3" />
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessuna utenza attiva ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto mb-4">
            Attiva luce, gas e internet nella tua nuova casa e da qui potrai
            seguire importi e scadenze delle bollette.
          </p>
          <button className="bg-gold text-ink font-bold text-sm py-3 px-5 rounded-xl">
            Attiva luce, gas e internet
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/10 pb-2">
      <span className="text-ink/50">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
