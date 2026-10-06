"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { ordinaCandidati } from "@/lib/match";
import { valutaCandidatura } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { MOTIVI_RIFIUTO } from "@/lib/motivi-rifiuto";
import type { ChiaveMotivoRifiuto } from "@/lib/motivi-rifiuto";
import { IconPersone } from "@/components/icons";

const BADGE: Record<string, string> = {
  in_attesa: "is-wait",
  accettata: "is-match",
  rifiutata: "is-off",
};
const LABEL: Record<string, string> = {
  in_attesa: "Da valutare",
  accettata: "Accettata",
  rifiutata: "Rifiutata",
};
const SIMBOLO = { ok: "✓", no: "–", non_indicato: "?" } as const;

/** Colore del badge in base alla percentuale, con le stesse soglie delle etichette. */
function classePercentuale(pct: number): string {
  if (pct >= 70) return "is-match";
  if (pct >= 50) return "is-wait";
  return "is-off";
}

type Annuncio = {
  id: string;
  titolo: string;
  zona: string;
  candidature: CandidaturaRicevuta[];
};

export function DatabaseClient({
  candidature,
}: {
  candidature: CandidaturaRicevuta[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaRicevuta | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  // Accettare e rifiutare non si annullano: prima si chiede conferma, e per
  // il rifiuto anche il motivo, che l'inquilino leggerà.
  const [confermando, setConfermando] = useState<"accettata" | "rifiutata" | null>(null);
  const [motivo, setMotivo] = useState<ChiaveMotivoRifiuto | null>(null);
  const [aggiornate, setAggiornate] = useState<
    Record<string, "accettata" | "rifiutata">
  >({});

  function stato(c: CandidaturaRicevuta): string {
    return aggiornate[c.id] ?? c.status;
  }

  function chiudi() {
    setSelezionata(null);
    setErrore(null);
    setConfermando(null);
    setMotivo(null);
  }

  function apri(c: CandidaturaRicevuta) {
    setErrore(null);
    setConfermando(null);
    setMotivo(null);
    setSelezionata(c);
  }

  function valuta(c: CandidaturaRicevuta, nuovo: "accettata" | "rifiutata") {
    setErrore(null);
    startTransition(async () => {
      const res = await valutaCandidatura(
        c.id,
        nuovo,
        nuovo === "rifiutata" ? (motivo ?? undefined) : undefined
      );
      if (res?.error) {
        setErrore(res.error);
        return;
      }
      setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
      chiudi();
    });
  }

  // ---- raggruppo per annuncio ----
  const perAnnuncio = new Map<string, Annuncio>();
  for (const c of candidature) {
    const gruppo = perAnnuncio.get(c.listing_id) ?? {
      id: c.listing_id,
      titolo: c.listings?.titolo ?? "Annuncio",
      zona: c.listings?.zona ?? "",
      candidature: [],
    };
    gruppo.candidature.push(c);
    perAnnuncio.set(c.listing_id, gruppo);
  }

  const daValutare = (a: Annuncio) =>
    a.candidature.filter((c) => stato(c) === "in_attesa").length;

  // prima gli annunci con più candidati in attesa
  const annunci = [...perAnnuncio.values()].sort(
    (a, b) => daValutare(b) - daValutare(a) || a.titolo.localeCompare(b.titolo)
  );

  const totaleInAttesa = candidature.filter((c) => stato(c) === "in_attesa").length;

  return (
    <PageContainer wide>
      <h1 className="screen-title">Database inquilini</h1>
      <p className="screen-sub">
        {candidature.length === 0
          ? "Le candidature ricevute sui tuoi annunci arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a ricevuta" : "e ricevute"} · ${totaleInAttesa} da valutare.`}
      </p>

      {candidature.length === 0 && (
        <div className="empty-inline">
          <IconPersone className="icon-empty" />
          <h3>Nessuna candidatura ancora</h3>
          <p>
            Appena qualcuno si candiderà su un tuo annuncio pubblicato, lo
            vedrai qui.
          </p>
        </div>
      )}

      {annunci.map((a) => (
        <SezioneAnnuncio
          key={a.id}
          annuncio={a}
          stato={stato}
          onSelect={apri}
        />
      ))}

      <Sheet
        open={selezionata !== null}
        onClose={chiudi}
        title={
          selezionata
            ? `${selezionata.nome ?? "Inquilino"} ${selezionata.cognome ?? ""}`
            : "Candidatura"
        }
      >
        {selezionata && (
          <>
            {selezionata.tenant_profiles?.avatar_url && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selezionata.tenant_profiles.avatar_url}
                  alt={`Foto di ${selezionata.nome ?? "inquilino"}`}
                  className="w-24 h-24 rounded-full object-cover"
                />
              </div>
            )}

            <p className="sheet-sub">
              Candidatura per <b>{selezionata.listings?.titolo}</b>
            </p>

            {selezionata.valutazione && (
              <PercheMatchProprietario valutazione={selezionata.valutazione} />
            )}

            <DettaglioRow
              label="Situazione lavorativa"
              value={selezionata.tenant_profiles?.professione ?? "—"}
            />
            <DettaglioRow
              label="Reddito dichiarato"
              value={
                selezionata.tenant_profiles?.reddito_mensile
                  ? `€${selezionata.tenant_profiles.reddito_mensile.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Reddito del nucleo"
              value={
                selezionata.tenant_profiles?.reddito_nucleo
                  ? `€${selezionata.tenant_profiles.reddito_nucleo.toLocaleString("it-IT")}/mese`
                  : "Non indicato"
              }
            />
            <DettaglioRow
              label="Reddito verificato"
              value={selezionata.tenant_profiles?.verificato ? "Sì" : "No"}
            />
            {selezionata.valutazione && (
              <DettaglioRow
                label="Affidabilità"
                value={`${selezionata.valutazione.affidabilita}/100`}
              />
            )}
            {selezionata.tenant_profiles?.presentazione && (
              <div style={{ marginTop: 18 }}>
                <div className="pref-label">
                  <span>Presentazione</span>
                </div>
                <p className="note-box" style={{ marginTop: 0, fontStyle: "italic" }}>
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            {errore && (
              <p className="note-error" style={{ marginTop: 14 }}>
                {errore}
              </p>
            )}

            {stato(selezionata) === "in_attesa" ? (
              confermando === null ? (
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setConfermando("rifiutata")}
                    className="btn-danger-outline"
                  >
                    Rifiuta
                  </button>
                  <button
                    onClick={() => setConfermando("accettata")}
                    className="opp-cta"
                  >
                    Accetta
                  </button>
                </div>
              ) : confermando === "accettata" ? (
                <div className="conferma">
                  <p className="conferma-titolo">
                    Accettare {selezionata.nome ?? "questo candidato"}?
                  </p>
                  <p className="conferma-testo">
                    Si apre la chat con il candidato. La decisione non si può
                    annullare.
                  </p>
                  {selezionata.valutazione?.match.bloccato && (
                    <div className="note-stop">
                      Attenzione: non soddisfa un criterio obbligatorio che hai
                      chiesto ({selezionata.valutazione.match.mancanti.join(", ")}).
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfermando(null)}
                      disabled={pending}
                      className="btn-danger-outline"
                      style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => valuta(selezionata, "accettata")}
                      disabled={pending}
                      className="opp-cta"
                    >
                      {pending ? "Un momento..." : "Sì, accetta"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="conferma">
                  <p className="conferma-titolo">Perché rifiuti?</p>
                  <p className="conferma-testo">
                    L&apos;inquilino leggerà il motivo che scegli. La decisione
                    non si può annullare.
                  </p>
                  <div className="chip-row" style={{ marginBottom: 16 }}>
                    {MOTIVI_RIFIUTO.map((m) => (
                      <Chip
                        key={m.chiave}
                        label={m.scelta}
                        active={motivo === m.chiave}
                        onClick={() => setMotivo(m.chiave)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfermando(null)}
                      disabled={pending}
                      className="btn-danger-outline"
                      style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => valuta(selezionata, "rifiutata")}
                      disabled={pending || motivo === null}
                      className="opp-cta"
                      style={{ background: motivo ? "var(--clay)" : undefined }}
                    >
                      {pending ? "Un momento..." : "Conferma il rifiuto"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3 mt-6">
                <div
                  className={
                    stato(selezionata) === "accettata" ? "note-ok" : "note-box"
                  }
                  style={{ marginTop: 0 }}
                >
                  {stato(selezionata) === "accettata"
                    ? "Hai accettato questa candidatura."
                    : "Hai rifiutato questa candidatura."}
                </div>
                {stato(selezionata) === "accettata" && (
                  <Link
                    href={`/chat/${selezionata.id}`}
                    className="opp-cta block text-center"
                  >
                    Apri chat
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}

// ------------------------------------------------------------

function SezioneAnnuncio({
  annuncio,
  stato,
  onSelect,
}: {
  annuncio: Annuncio;
  stato: (c: CandidaturaRicevuta) => string;
  onSelect: (c: CandidaturaRicevuta) => void;
}) {
  const attesa = annuncio.candidature.filter((c) => stato(c) === "in_attesa");
  const valutate = annuncio.candidature.filter((c) => stato(c) !== "in_attesa");

  // In attesa: prima chi soddisfa i criteri obbligatori, poi per percentuale,
  // a parità per affidabilità. Se manca la valutazione resta l'ordine di arrivo.
  const ordinate = attesa.every((c) => c.valutazione)
    ? ordinaCandidati(
        attesa.map((c) => ({
          c,
          match: c.valutazione!.match,
          affidabilita: c.valutazione!.affidabilita,
        }))
      ).map((v) => v.c)
    : attesa;

  return (
    <>
      <div className="pref-label" style={{ marginTop: 26 }}>
        <span>
          {annuncio.titolo}
          {annuncio.zona && ` · ${annuncio.zona.replace(", Milano", "")}`}
        </span>
        <b>
          {attesa.length} da valutare
        </b>
      </div>

      {ordinate.length > 0 && (
        <div className="card-grid">
          {ordinate.map((c) => (
            <Scheda key={c.id} c={c} stato={stato(c)} onSelect={onSelect} />
          ))}
        </div>
      )}

      {valutate.length > 0 && (
        <>
          <div className="sotto-label">Già valutate — {valutate.length}</div>
          <div className="card-grid">
            {valutate.map((c) => (
              <Scheda key={c.id} c={c} stato={stato(c)} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Scheda({
  c,
  stato,
  onSelect,
}: {
  c: CandidaturaRicevuta;
  stato: string;
  onSelect: (c: CandidaturaRicevuta) => void;
}) {
  const iniziali = `${c.nome?.[0] ?? ""}${c.cognome?.[0] ?? ""}`.toUpperCase();
  const v = c.valutazione;
  const inAttesa = stato === "in_attesa";

  let badge = (
    <div className={`mc-pct ${BADGE[stato]}`}>{LABEL[stato]}</div>
  );
  if (inAttesa && v) {
    if (v.match.bloccato) {
      badge = (
        <div className="mc-pct is-alert">
          Bloccato<span>obbligatorio</span>
        </div>
      );
    } else if (v.match.punteggio !== null) {
      badge = (
        <div className={`mc-pct ${classePercentuale(v.match.punteggio)}`}>
          {v.match.punteggio}%<span>compatibile</span>
        </div>
      );
    }
  }

  return (
    <button onClick={() => onSelect(c)} className="match-card">
      {c.tenant_profiles?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.tenant_profiles.avatar_url} alt="" />
      ) : (
        <div className="mc-avatar">{iniziali || "IN"}</div>
      )}
      <div className="mc-body">
        <div className="mc-zona">
          {c.tenant_profiles?.professione ?? "Profilo inquilino"}
        </div>
        <div className="mc-title">
          {c.nome} {c.cognome}
        </div>
        <div className="mc-meta">
          {v ? `Affidabilità ${v.affidabilita}` : ""}
          {v?.match.incompleto && inAttesa && " · dati incompleti"}
          {!inAttesa && v?.match.punteggio != null && ` · compatibilità ${v.match.punteggio}%`}
        </div>
      </div>
      {badge}
    </button>
  );
}

// ------------------------------------------------------------

/**
 * "Perché vedi questo numero", dal lato del proprietario: i criteri che ha
 * chiesto, quali il candidato soddisfa, e se qualcuno obbligatorio manca.
 */
export function PercheMatchProprietario({
  valutazione,
}: {
  valutazione: NonNullable<CandidaturaRicevuta["valutazione"]>;
}) {
  const { match, congelata } = valutazione;

  if (match.punteggio === null) {
    return (
      <div className="note-box" style={{ marginTop: 0, marginBottom: 18 }}>
        Per questo annuncio non hai chiesto nessun criterio, quindi non c&apos;è
        una percentuale. Puoi aggiungerli da Immobili.
      </div>
    );
  }

  return (
    <div className="match-box">
      <div className="match-box-top">
        <div className="match-box-pct">{match.punteggio}%</div>
        <div>
          <div className="match-box-label">{match.etichetta}</div>
          <div className="match-box-sub">
            {congelata
              ? "Fotografia al momento della tua decisione"
              : "Sui criteri che hai chiesto, con i dati attuali"}
          </div>
        </div>
      </div>

      {match.bloccato && (
        <div className="note-stop">
          Non soddisfa un criterio obbligatorio: {match.mancanti.join(", ")}.
        </div>
      )}

      <div className="perche-lista">
        {match.criteri.map((c) => (
          <div key={c.chiave} className={`perche-row ${c.stato}`}>
            <span className="perche-simbolo">{SIMBOLO[c.stato]}</span>
            <span className="perche-testo">
              {c.etichetta}
              {c.obbligatorio && <em className="tag-obbl">obbligatorio</em>}
              {c.dettaglio && <small>{c.dettaglio}</small>}
              {c.stato === "non_indicato" && <small>Non indicato dal candidato</small>}
            </span>
          </div>
        ))}
      </div>

      {match.incompleto && !congelata && (
        <p className="field-note" style={{ marginTop: 8 }}>
          Il candidato non ha indicato alcuni dati: se li compila, la
          percentuale può salire.
        </p>
      )}
      <p className="field-note" style={{ marginTop: 8 }}>
        È una compatibilità sui dati dichiarati dal candidato, non una
        valutazione della persona né una previsione.
      </p>
    </div>
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
