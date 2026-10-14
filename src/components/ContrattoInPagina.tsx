"use client";

import { useId, useState } from "react";
import type { ContrattoConAnnuncio } from "@/lib/types";
import { BozzaContratto } from "@/components/BozzaContratto";
import { ArchivioContratto } from "@/components/ArchivioContratto";
import { FirmaContratto } from "@/components/FirmaContratto";
import type { FirmeDelContratto } from "@/lib/firma/carica";
import type { DocumentoContratto } from "@/lib/documenti-contratto";
import { badgeStato, etichettaStato, type ModoContratto } from "@/lib/contratti";
import { IconChevronSu } from "@/components/icons";

function formatData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feat-row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

/**
 * Un contratto, direttamente nella pagina (non in una scheda a comparsa): l'intestazione con l'immobile e lo stato, e sotto
 * i dati, la bozza, la firma e l'archivio dei documenti.
 *
 * `fisso`: tutto sempre visibile. `a_scomparsa`: l'intestazione è un pulsante che apre e chiude il resto. Il corpo resta
 * montato anche da chiuso (solo nascosto), così ciò che si stava facendo (un documento da caricare, la firma) non si perde.
 */
export function ContrattoInPagina({
  c,
  modo,
  firme,
  documenti,
  passato = false,
}: {
  c: ContrattoConAnnuncio;
  modo: ModoContratto;
  firme: FirmeDelContratto | undefined;
  documenti: DocumentoContratto[];
  /** i contratti dello storico sono attenuati, come le candidature chiuse */
  passato?: boolean;
}) {
  const idCorpo = useId();
  const [aperto, setAperto] = useState(false);
  const scomparsa = modo === "a_scomparsa";
  const visibile = !scomparsa || aperto;
  const titolo = c.candidature?.listings?.titolo ?? "Immobile";

  const intestazione = (
    <>
      <div className="mc-avatar">{titolo.slice(0, 2).toUpperCase()}</div>
      <div className="mc-body">
        <div className="mc-zona">{c.candidature?.listings?.zona ?? ""}</div>
        <div className="mc-title">{titolo}</div>
        <div className="mc-meta">{c.canone ? `€${c.canone.toLocaleString("it-IT")}/mese` : "—"}</div>
      </div>
      <div className={`mc-pct ${badgeStato(c.stato)}`}>{etichettaStato(c.stato)}</div>
      {scomparsa && <IconChevronSu className={`contratto-freccia ${aperto ? "" : "chiuso"}`} />}
    </>
  );

  return (
    <section className={`contratto-blocco ${passato ? "passato" : ""}`} aria-label={`Contratto: ${titolo}`}>
      {scomparsa ? (
        <button type="button" className="contratto-testa" aria-expanded={aperto} aria-controls={idCorpo} onClick={() => setAperto((a) => !a)}>
          {intestazione}
        </button>
      ) : (
        <div className="contratto-testa">{intestazione}</div>
      )}

      <div id={idCorpo} className="contratto-corpo" hidden={!visibile}>
        {/* la zona e il canone sono già nell'intestazione: non si ripetono */}
        <DettaglioRow label="Durata" value={c.durata_mesi ? `${c.durata_mesi} mesi` : "—"} />
        <DettaglioRow label="Data inizio" value={formatData(c.data_inizio)} />
        <DettaglioRow label="Data firma" value={formatData(c.data_firma)} />
        <BozzaContratto contrattoId={c.id} />
        <FirmaContratto contrattoId={c.id} statoContratto={c.stato} firme={firme?.firme ?? []} improntaAttuale={firme?.improntaAttuale ?? null} />
        <ArchivioContratto contrattoId={c.id} documenti={documenti} />
      </div>
    </section>
  );
}
