"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { FormFeedback } from "@/components/FormFeedback";
import {
  descriviRapporto,
  descriviRichiesta,
  linkRichiesta,
  messaggioRichiesta,
  validaIndirizzo,
  validaPeriodo,
} from "@/lib/rapporti";
import type {
  ImmobileScelta,
  RapportoMio,
  RichiestaMia,
  RuoloRapporto,
} from "@/lib/rapporti";
import {
  estensioneDa,
  messaggioErroreVerifica,
  percorsoDocumento,
  validaFileDocumento,
} from "@/lib/verifica";

const BADGE = { ok: "is-match", attesa: "is-wait", da_fare: "is-off", respinto: "is-alert" } as const;

function periodoTesto(da: string, a: string | null): string {
  const f = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("it-IT", { month: "short", year: "numeric", timeZone: "UTC" });
  return a ? `${f(da)} → ${f(a)}` : `da ${f(da)}, in corso`;
}

/**
 * Dichiarare un affitto e seguirlo: una parte lo dichiara con il contratto,
 * l'altra lo conferma da un link, poi lo controlliamo noi.
 *
 * Lo stesso pannello serve inquilino e proprietario. Cambia una cosa: il
 * proprietario sceglie uno dei suoi immobili; l'inquilino lo descrive a
 * parole, e sarà il proprietario a dire quale dei suoi è.
 */
export function RapportiPanel({
  ruolo,
  nomeCreatore,
  immobili,
  richieste,
  rapporti,
  puoLasciareFeedback = false,
}: {
  ruolo: RuoloRapporto;
  nomeCreatore: string | null;
  immobili: ImmobileScelta[];
  richieste: RichiestaMia[];
  rapporti: RapportoMio[];
  /** il proprietario è verificato: solo allora può lasciare un feedback */
  puoLasciareFeedback?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [linkAperto, setLinkAperto] = useState<string | null>(null);
  const [feedbackPer, setFeedbackPer] = useState<string | null>(null);

  const [immobileId, setImmobileId] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const oggi = new Date().toISOString().slice(0, 10);
  const inSospeso = richieste.filter((r) => r.stato !== "confermata");

  async function dichiara() {
    setErrore(null);

    if (ruolo === "proprietario" && !immobileId) {
      setErrore("Scegli di quale immobile si tratta.");
      return;
    }
    if (ruolo === "inquilino") {
      const e = validaIndirizzo(indirizzo);
      if (e) return setErrore(e);
    }
    const ep = validaPeriodo(da, a, oggi);
    if (ep) return setErrore(ep);
    if (!file) return setErrore("Carica il contratto: serve a controllare l'affitto.");
    const ef = validaFileDocumento(file);
    if (ef) return setErrore(ef);
    const estensione = estensioneDa(file.type);
    if (!estensione) return setErrore("Il file deve essere un PDF, una foto JPG o una foto PNG.");

    setOccupato(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setErrore(messaggioErroreVerifica("NON_AUTENTICATO"));

      const percorso = percorsoDocumento({
        userId: user.id,
        tipo: "contratto",
        listingId: null,
        estensione,
        id: crypto.randomUUID(),
      });

      const { error: eFile } = await supabase.storage
        .from("documenti-verifica")
        .upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) return setErrore("Non sono riuscito a caricare il contratto. Riprova.");

      const { data: token, error: eRpc } = await supabase.rpc("crea_richiesta_rapporto", {
        p_listing: ruolo === "proprietario" ? immobileId : null,
        p_indirizzo: ruolo === "inquilino" ? indirizzo.trim() : null,
        p_da: da,
        p_a: a.trim() === "" ? null : a,
        p_path: percorso,
        p_nome: file.name.slice(0, 200),
      });
      if (eRpc || typeof token !== "string") {
        return setErrore(messaggioErroreVerifica(eRpc?.message));
      }

      setForm(false);
      setLinkAperto(token);
      setIndirizzo("");
      setImmobileId("");
      setDa("");
      setA("");
      setFile(null);
      router.refresh();
    } finally {
      setOccupato(false);
    }
  }

  async function ritiraRichiesta(id: string) {
    setErrore(null);
    const { error } = await createClient().from("richieste_rapporto").delete().eq("id", id);
    if (error) return setErrore("Non sono riuscito a ritirare la richiesta. Riprova.");
    if (linkAperto) setLinkAperto(null);
    router.refresh();
  }

  async function ritiraRapporto(id: string) {
    setErrore(null);
    const { error } = await createClient().from("rapporti_locazione").delete().eq("id", id);
    if (error) return setErrore("Non sono riuscito a ritirare l'affitto. Riprova.");
    router.refresh();
  }

  return (
    <div>
      <p className="field-note" style={{ margin: "0 0 14px 0", lineHeight: 1.6 }}>
        Un affitto dichiarato vale per i feedback solo se l&apos;altra persona
        lo conferma e se il contratto, che vediamo solo noi, risulta in regola.
        L&apos;altra persona vede i dati principali, non il contratto.
      </p>

      {errore && (
        <p className="note-error" style={{ marginBottom: 12 }}>
          {errore}
        </p>
      )}

      {/* ---- Affitti già confermati ---- */}
      {rapporti.length > 0 && (
        <>
          <div className="pref-label">
            <span>Affitti dichiarati</span>
          </div>
          <div className="rapporti-lista">
            {rapporti.map((r) => {
              const d = descriviRapporto(r.stato, r.esito_note);
              return (
                <div key={r.id} className="verifica-card">
                  <div className="verifica-card-testa">
                    <div>
                      <b>{r.controparte ?? "Affitto"}</b>
                      <small>
                        {[r.immobile, periodoTesto(r.periodo_da, r.periodo_a)].filter(Boolean).join(" · ")}
                      </small>
                    </div>
                    <span className={`mc-pct ${BADGE[d.tono]}`}>{d.etichetta}</span>
                  </div>
                  {r.stato === "respinto" && r.esito_note && (
                    <div className="note-stop" style={{ marginTop: 10 }}>
                      Motivo: {r.esito_note}
                    </div>
                  )}
                  <p className="field-note" style={{ margin: "8px 0 0 0" }}>
                    {d.testo}
                  </p>
                  {r.stato === "verificato" && (
                    <FeedbackAffitto
                      ruolo={ruolo}
                      rapporto={r}
                      puoLasciare={puoLasciareFeedback}
                      aperto={feedbackPer === r.id}
                      onApri={() => setFeedbackPer(r.id)}
                      onChiudi={() => setFeedbackPer(null)}
                      onFatto={() => {
                        setFeedbackPer(null);
                        router.refresh();
                      }}
                    />
                  )}
                  {r.creatoDaMe && r.stato !== "verificato" && (
                    <button type="button" className="redo-link" style={{ marginTop: 8 }} onClick={() => ritiraRapporto(r.id)}>
                      Ritira
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---- Richieste ancora senza risposta ---- */}
      {inSospeso.length > 0 && (
        <>
          <div className="pref-label" style={{ marginTop: 20 }}>
            <span>In attesa dell&apos;altra persona</span>
          </div>
          <div className="rapporti-lista">
            {inSospeso.map((r) => {
              const d = descriviRichiesta(r.stato, r.scaduta);
              return (
                <div key={r.id} className="verifica-card">
                  <div className="verifica-card-testa">
                    <div>
                      <b>{r.immobile ?? "Affitto"}</b>
                      <small>{periodoTesto(r.periodo_da, r.periodo_a)}</small>
                    </div>
                    <span className={`mc-pct ${BADGE[d.tono]}`}>{d.etichetta}</span>
                  </div>
                  <p className="field-note" style={{ margin: "8px 0 0 0" }}>
                    {d.testo}
                  </p>
                  <div className="flex gap-3" style={{ marginTop: 8 }}>
                    {r.stato === "in_attesa" && !r.scaduta && (
                      <button type="button" className="redo-link" onClick={() => setLinkAperto(r.token)}>
                        Mostra il link
                      </button>
                    )}
                    <button type="button" className="redo-link" onClick={() => ritiraRichiesta(r.id)}>
                      Ritira
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {linkAperto && (
        <LinkCondiviso
          token={linkAperto}
          nomeCreatore={nomeCreatore}
          ruolo={ruolo}
          onChiudi={() => setLinkAperto(null)}
        />
      )}

      {/* ---- Nuova dichiarazione ---- */}
      {!form ? (
        <button
          type="button"
          className="opp-cta"
          style={{ marginTop: 20 }}
          onClick={() => {
            setForm(true);
            setLinkAperto(null);
          }}
        >
          Dichiara un affitto
        </button>
      ) : (
        <div className="passo-verifica" style={{ marginTop: 20 }}>
          <div className="pref-label">
            <span>Dichiara un affitto</span>
          </div>

          {ruolo === "proprietario" ? (
            <Field label="Quale tuo immobile">
              {immobili.length === 0 ? (
                <p className="field-note">
                  Non hai ancora aggiunto nessun immobile: aggiungilo da Immobili e poi torna qui.
                </p>
              ) : (
                <select
                  className="contract-input"
                  value={immobileId}
                  onChange={(e) => setImmobileId(e.target.value)}
                  aria-label="Quale tuo immobile"
                >
                  <option value="">Scegli…</option>
                  {immobili.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.titolo} · {i.zona}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <Field label="Indirizzo dell'immobile">
              <input
                className="contract-input"
                value={indirizzo}
                onChange={(e) => setIndirizzo(e.target.value)}
                placeholder="Via, numero, città"
                aria-label="Indirizzo dell'immobile"
              />
            </Field>
          )}

          <Field label="Quando è cominciato">
            <input
              type="date"
              className="contract-input"
              value={da}
              max={oggi}
              onChange={(e) => setDa(e.target.value)}
              aria-label="Quando è cominciato"
            />
          </Field>
          <Field label="Quando è finito (vuoto se è ancora in corso)">
            <input
              type="date"
              className="contract-input"
              value={a}
              onChange={(e) => setA(e.target.value)}
              aria-label="Quando è finito"
            />
          </Field>

          <Field label="Il contratto">
            <label className="chip selettore-file">
              {file ? file.name : "Scegli il file"}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                aria-label="Il contratto"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="field-note">
              PDF o foto, fino a 10 MB. Lo vedono solo il team di MatchAmI e tu: non l&apos;altra persona.
            </p>
          </Field>

          <div className="flex gap-3" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn-danger-outline"
              style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
              onClick={() => {
                setForm(false);
                setErrore(null);
              }}
              disabled={occupato}
            >
              Annulla
            </button>
            <button type="button" className="opp-cta" disabled={occupato} onClick={dichiara}>
              {occupato ? "Invio..." : "Crea il link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Il messaggio da mandare all'altra persona, con il link. */
function LinkCondiviso({
  token,
  nomeCreatore,
  ruolo,
  onChiudi,
}: {
  token: string;
  nomeCreatore: string | null;
  ruolo: RuoloRapporto;
  onChiudi: () => void;
}) {
  const [copiato, setCopiato] = useState(false);
  const link = linkRichiesta(window.location.origin, token);
  const testo = messaggioRichiesta({ nomeCreatore, ruolo, link });

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setCopiato(false);
    }
  }

  function condividi() {
    if (navigator.share) {
      navigator.share({ text: testo }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, "_blank", "noopener");
    }
  }

  return (
    <div className="passo-verifica" style={{ marginTop: 18 }}>
      <div className="note-ok" style={{ marginBottom: 14 }}>
        Link pronto. Mandalo tu all&apos;altra persona: finché non lo apre e non conferma, l&apos;affitto non conta.
      </div>
      <Field label="Il messaggio da mandare">
        <textarea readOnly value={testo} className="ob-textarea" rows={5} aria-label="Il messaggio da mandare" />
      </Field>
      <div className="flex gap-3">
        <button type="button" onClick={condividi} className="opp-cta">
          Condividi
        </button>
        <button
          type="button"
          onClick={copia}
          className="btn-danger-outline"
          style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
        >
          {copiato ? "Copiato" : "Copia"}
        </button>
      </div>
      <button type="button" className="redo-link" style={{ marginTop: 14 }} onClick={onChiudi}>
        Chiudi
      </button>
    </div>
  );
}

/**
 * Cosa si può fare, per un affitto verificato, sul feedback. Il proprietario
 * lo lascia (una volta sola, se è verificato); l'inquilino sa solo se c'è.
 */
function FeedbackAffitto({
  ruolo,
  rapporto,
  puoLasciare,
  aperto,
  onApri,
  onChiudi,
  onFatto,
}: {
  ruolo: RuoloRapporto;
  rapporto: RapportoMio;
  puoLasciare: boolean;
  aperto: boolean;
  onApri: () => void;
  onChiudi: () => void;
  onFatto: () => void;
}) {
  if (ruolo === "inquilino") {
    return rapporto.recensito ? (
      <p className="field-note" style={{ margin: "8px 0 0 0" }}>
        <b>Feedback ricevuto</b>
      </p>
    ) : null;
  }

  if (rapporto.recensito) {
    return (
      <p className="field-note" style={{ margin: "8px 0 0 0" }}>
        <b>Feedback lasciato</b>
        {rapporto.votoDato ? ` · ${rapporto.votoDato}/5` : ""}
      </p>
    );
  }

  if (!puoLasciare) {
    return (
      <p className="field-note" style={{ margin: "8px 0 0 0" }}>
        Per lasciare un feedback ti serve un immobile verificato.
      </p>
    );
  }

  if (aperto) {
    return (
      <FormFeedback
        rapportoId={rapporto.id}
        nome={rapporto.controparte}
        onFatto={onFatto}
        onAnnulla={onChiudi}
      />
    );
  }

  return (
    <button type="button" className="opp-cta" style={{ marginTop: 10 }} onClick={onApri}>
      Lascia un feedback
    </button>
  );
}
