"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio } from "@/lib/types";
import {
  NOTA_RITIRATA,
  SCHEDE_MATCH,
  STATO_BADGE,
  STATO_LABEL,
  puoRitirare,
  riepilogoCandidature,
  sezioniCandidature,
  type SchedaMatch,
} from "@/lib/candidature";
import { RitiraCandidatura } from "@/components/RitiraCandidatura";
import { RichiesteProprietari } from "@/components/RichiesteProprietari";
import { richiesteInAttesa, type RichiestaPerInquilino } from "@/lib/richieste";
import { PageContainer } from "@/components/ui/PageContainer";
import { messaggioMotivoRifiuto } from "@/lib/motivi-rifiuto";
import { IconChevronSu, IconMatch } from "@/components/icons";

export function CandidatureClient({
  candidature,
  richieste = [],
  visibile = false,
  schedaIniziale = "candidature",
}: {
  candidature: CandidaturaConAnnuncio[];
  /** le richieste dei proprietari */
  richieste?: RichiestaPerInquilino[];
  /** l'inquilino si è reso disponibile a essere trovato dai proprietari */
  visibile?: boolean;
  schedaIniziale?: SchedaMatch;
}) {
  const router = useRouter();
  const idBase = useId();
  const [scheda, setScheda] = useState<SchedaMatch>(schedaIniziale);
  const nRichieste = richiesteInAttesa(richieste).length;
  const [selezionata, setSelezionata] = useState<CandidaturaConAnnuncio | null>(null);

  const sezioni = sezioniCandidature(candidature);

  // frecce destra/sinistra tra le due schede, come ci si aspetta da un gruppo di schede
  function tastoScheda(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = SCHEDE_MATCH.findIndex((s) => s.id === scheda);
    const prossima = SCHEDE_MATCH[(i + (e.key === "ArrowRight" ? 1 : SCHEDE_MATCH.length - 1)) % SCHEDE_MATCH.length].id;
    setScheda(prossima);
    document.getElementById(`${idBase}-${prossima}`)?.focus();
  }

  return (
    <PageContainer wide>
      <h1 className="screen-title">I tuoi match</h1>

      <div className="match-schede" role="tablist" aria-label="I tuoi match" onKeyDown={tastoScheda}>
        {SCHEDE_MATCH.map((s) => (
          <button
            key={s.id}
            id={`${idBase}-${s.id}`}
            type="button"
            role="tab"
            aria-selected={scheda === s.id}
            aria-controls={`${idBase}-pannello-${s.id}`}
            tabIndex={scheda === s.id ? 0 : -1}
            className={scheda === s.id ? "attiva" : ""}
            onClick={() => setScheda(s.id)}
          >
            {s.etichetta}
            {s.id === "candidature" && candidature.length > 0 && <span className="conteggio">{candidature.length}</span>}
            {s.id === "richieste" && nRichieste > 0 && <span className="conteggio da-leggere">{nRichieste}</span>}
          </button>
        ))}
      </div>

      {/* ---- Le tue candidature, divise per come sono andate ---- */}
      <div role="tabpanel" id={`${idBase}-pannello-candidature`} aria-labelledby={`${idBase}-candidature`} hidden={scheda !== "candidature"}>
        <p className="screen-sub">{riepilogoCandidature(candidature)}</p>

        {candidature.length === 0 ? (
          <div className="empty-inline">
            <IconMatch className="icon-empty" />
            <h3>Ancora nessuna candidatura</h3>
            <p>Torna alla Home e scorri gli annunci: le tue candidature e gli eventuali match finiscono qui.</p>
          </div>
        ) : (
          sezioni.map((s) => <Gruppo key={s.id} titolo={s.titolo} items={s.items} apertaAllInizio={s.aperta} onSelect={setSelezionata} />)
        )}
      </div>

      {/* ---- Le richieste che arrivano dai proprietari ---- */}
      <div role="tabpanel" id={`${idBase}-pannello-richieste`} aria-labelledby={`${idBase}-richieste`} hidden={scheda !== "richieste"}>
        <RichiesteProprietari richieste={richieste} visibile={visibile} />
      </div>

      <Sheet open={selezionata !== null} onClose={() => setSelezionata(null)} title={selezionata?.listings?.titolo ?? "Candidatura"}>
        {selezionata && (
          <>
            <div className="mb-4">
              <span className={`mc-pct ${STATO_BADGE[selezionata.status]}`}>{STATO_LABEL[selezionata.status]}</span>
            </div>

            <DettaglioRow label="Zona" value={selezionata.listings?.zona ?? "—"} />
            <DettaglioRow
              label="Canone"
              value={selezionata.listings?.prezzo ? `€${selezionata.listings.prezzo.toLocaleString("it-IT")}/mese` : "—"}
            />
            <DettaglioRow
              label="Taglio"
              value={selezionata.listings?.locali ? `${selezionata.listings.locali} locali · ${selezionata.listings.mq ?? "—"} m²` : "—"}
            />
            {selezionata.match_pct !== null && <DettaglioRow label="Compatibilità" value={`${selezionata.match_pct}%`} />}

            {selezionata.status === "accettata" && (
              <div className="flex flex-col gap-3 mt-5">
                <div className="note-ok">Il proprietario ha accettato la tua candidatura.</div>
                <Link href={`/chat/${selezionata.id}`} className="opp-cta block text-center">
                  Apri chat
                </Link>
              </div>
            )}
            {selezionata.status === "in_attesa" && (
              <>
                <div className="note-box mt-5">Il proprietario non ha ancora valutato questa candidatura.</div>
                {puoRitirare(selezionata.status) && (
                  <RitiraCandidatura
                    key={selezionata.id}
                    candidaturaId={selezionata.id}
                    titolo={selezionata.listings?.titolo ?? null}
                    onFatto={() => {
                      setSelezionata(null);
                      router.refresh();
                    }}
                  />
                )}
              </>
            )}
            {selezionata.status === "ritirata" && <div className="note-box mt-5">{NOTA_RITIRATA}</div>}
            {selezionata.status === "rifiutata" && <div className="note-box mt-5">{messaggioMotivoRifiuto(selezionata.motivo_rifiuto)}</div>}
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}

/** Una parte delle candidature: il titolo con il conteggio apre e chiude l'elenco. */
function Gruppo({
  titolo,
  items,
  apertaAllInizio,
  onSelect,
}: {
  titolo: string;
  items: CandidaturaConAnnuncio[];
  apertaAllInizio: boolean;
  onSelect: (c: CandidaturaConAnnuncio) => void;
}) {
  const [aperto, setAperto] = useState(apertaAllInizio);
  const id = useId();
  return (
    <section className="gruppo-match">
      <button type="button" className="gruppo-testa" aria-expanded={aperto} aria-controls={id} onClick={() => setAperto((a) => !a)}>
        <span>
          {titolo} — {items.length}
        </span>
        <IconChevronSu className={`gruppo-freccia ${aperto ? "" : "chiuso"}`} />
      </button>
      <div id={id} className="card-grid" hidden={!aperto}>
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="match-card"
            style={c.status === "rifiutata" || c.status === "ritirata" ? { opacity: 0.55 } : undefined}
          >
            <div className="mc-avatar">{(c.listings?.titolo ?? "IM").slice(0, 2).toUpperCase()}</div>
            <div className="mc-body">
              <div className="mc-zona">{c.listings?.zona ?? ""}</div>
              <div className="mc-title">{c.listings?.titolo ?? "Immobile"}</div>
              <div className="mc-meta">
                {c.listings?.prezzo ? `€${c.listings.prezzo.toLocaleString("it-IT")}/mese` : "—"}
                {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
              </div>
              {c.origine === "proprietario" && <div className="mc-origine">Ti ha scelto il proprietario</div>}
            </div>
            <div className={`mc-pct ${STATO_BADGE[c.status]}`}>{STATO_LABEL[c.status]}</div>
          </button>
        ))}
      </div>
    </section>
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
