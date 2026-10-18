"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { IconPersone } from "@/components/icons";
import { DettaglioPersona } from "@/components/database/DettaglioPersona";
import { ElencoDatabase } from "@/components/database/ElencoDatabase";
import { MOTIVI_RIFIUTO } from "@/lib/motivi-rifiuto";
import type { ChiaveMotivoRifiuto } from "@/lib/motivi-rifiuto";
import { azioniPerStato } from "@/lib/decisioni";
import { conteggiGruppo, datiSchedaCandidato, raggruppaPerAnnuncio, type CasaDatabase } from "@/lib/database-proprietario";
import {
  FILTRI_ELENCO_VUOTI,
  ORDINE_INIZIALE,
  conteggiSchede,
  costruisciBox,
  vociDaGruppi,
  vociFiltrate,
  vocePerDettaglio,
  type FiltriElenco,
  type Ordine,
} from "@/lib/database-elenco";
import { MESSAGGIO_RICHIESTA_MAX } from "@/lib/richieste";
import { normalizzaRicerca } from "@/lib/ricerca-candidati";
import type { PossibiliPerCasa } from "@/lib/proprietario/possibili-server";
import type { SchedaInquilino } from "@/lib/proprietario/possibili-inquilini";
import type { CandidaturaRicevuta } from "@/lib/types";
import { faiMatch, riapriCandidatura, valutaCandidatura } from "./actions";

type Stato = "in_attesa" | "accettata" | "rifiutata";
type Dialogo = { tipo: "match" | "scarta" | "annulla_match"; c: CandidaturaRicevuta };

/** Sotto questa larghezza il dettaglio di una persona si apre a tutto schermo; da qui in su sta accanto all'elenco (lo dice lo stile). */
const QUERY_DETTAGLIO_A_TUTTO_SCHERMO = "(max-width: 1279px)";

/**
 * Il Database inquilini: UN elenco di persone diviso per IMMOBILE (ogni immobile è un box che si apre e si chiude), con la ricerca, l'ordinamento
 * per affidabilità, match o recensioni (dal più alto o dal più basso) e il dettaglio della persona scelta. Per chi si è candidato: «Fai match» e
 * «Scarta» se aspetta, «Apri chat» e «Annulla match» se è un match, «Annulla scarto» se è stato scartato. Per chi non si è candidato ma cerca una
 * casa come la tua: «Fai match» manda una richiesta (con due parole facoltative).
 */
export function DatabaseClient({
  candidature,
  case_ = [],
  possibili = [],
}: {
  candidature: CandidaturaRicevuta[];
  /** le case del proprietario, con la prima foto */
  case_?: CasaDatabase[];
  /** per ogni casa che gli inquilini vedono: quanti cercano una casa come quella, chi si può contattare, le richieste mandate */
  possibili?: PossibiliPerCasa[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [motivo, setMotivo] = useState<ChiaveMotivoRifiuto | null>(null);
  // Lo stato che il proprietario ha appena dato (finché la pagina si ricarica con i dati nuovi)
  const [aggiornate, setAggiornate] = useState<Record<string, Stato>>({});
  const [avviso, setAvviso] = useState<{ testo: string; chat?: string } | null>(null);
  // Ciò che si cerca, si ordina e si apre resta in questa pagina: non si salva né si invia.
  const [ordine, setOrdine] = useState<Ordine>({ ...ORDINE_INIZIALE });
  const [filtri, setFiltri] = useState<FiltriElenco>({ ...FILTRI_ELENCO_VUOTI });
  const [chiusi, setChiusi] = useState<Record<string, boolean>>({});
  const [scelta, setScelta] = useState<string | null>(null);
  const [aTuttoSchermo, setATuttoSchermo] = useState(false);
  const [richiesta, setRichiesta] = useState<{ casa: PossibiliPerCasa; s: SchedaInquilino } | null>(null);
  const [messaggio, setMessaggio] = useState("");
  const chiudiRif = useRef<HTMLButtonElement>(null);
  const eraATuttoSchermo = useRef(false);

  const stato = (c: CandidaturaRicevuta): string => aggiornate[c.id] ?? c.status;

  // ---- le persone, per immobile, nell'ordine scelto ----
  const gruppi = raggruppaPerAnnuncio({ case_, candidature, possibili, stato });
  const voci = vociDaGruppi(gruppi);
  const casePer = new Map(gruppi.map((g) => [g.casa.id, g.casa] as const));
  const conteggi = conteggiSchede(vociFiltrate(voci, filtri, casePer));
  const box = costruisciBox({ gruppi, voci, filtri, ordine });
  const persone = box.reduce((s, b) => s + b.voci.length, 0);
  const corrente = vocePerDettaglio(box, scelta);
  const totaleDaValutare = gruppi.reduce((s, g) => s + g.spontanei.length, 0);
  const totalePossibili = gruppi.reduce((s, g) => s + conteggiGruppo(g).possibili, 0);
  const primoConPossibili = gruppi.find((g) => g.possibili !== null)?.casa.id ?? null;
  const conPunteggi = voci.some((v) => v.scheda.match.tipo === "pct");

  // ---- il dettaglio a tutto schermo (telefono): il fuoco va sul pulsante per tornare, e poi torna sulla persona; Esc lo chiude ----
  useEffect(() => {
    if (aTuttoSchermo) {
      eraATuttoSchermo.current = true;
      chiudiRif.current?.focus();
    } else if (eraATuttoSchermo.current) {
      eraATuttoSchermo.current = false;
      document.querySelector<HTMLElement>(`[data-chiave="${CSS.escape(scelta ?? "")}"]`)?.focus();
    }
  }, [aTuttoSchermo, scelta]);
  useEffect(() => {
    if (!aTuttoSchermo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dialogo === null && richiesta === null) setATuttoSchermo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aTuttoSchermo, dialogo, richiesta]);

  function seleziona(chiave: string) {
    setScelta(chiave);
    // solo quando serve: da computer il dettaglio c'è già accanto all'elenco
    if (window.matchMedia(QUERY_DETTAGLIO_A_TUTTO_SCHERMO).matches) setATuttoSchermo(true);
  }
  function cambiaFiltri(f: FiltriElenco) {
    // chi comincia a cercare vuole vedere i risultati: si aprono gli immobili che erano chiusi
    if (normalizzaRicerca(f.testo) !== "" && normalizzaRicerca(f.testo) !== normalizzaRicerca(filtri.testo)) setChiusi({});
    setFiltri(f);
  }
  const commuta = (casaId: string) => setChiusi((prev) => ({ ...prev, [casaId]: !prev[casaId] }));
  const tutti = (chiudi: boolean) => setChiusi(Object.fromEntries(gruppi.map((g) => [g.casa.id, chiudi])));

  // ---- le decisioni (le stesse di sempre) ----
  function chiudiDialogo() {
    setDialogo(null);
    setErrore(null);
    setMotivo(null);
  }
  function apriDialogo(tipo: Dialogo["tipo"], c: CandidaturaRicevuta) {
    setErrore(null);
    setMotivo(null);
    setDialogo({ tipo, c });
  }
  function dopo(c: CandidaturaRicevuta, nuovo: Stato, testo: string, chat?: string) {
    setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
    setAvviso({ testo, chat });
    setATuttoSchermo(false);
  }

  function conferma() {
    if (!dialogo) return;
    const { tipo, c } = dialogo;
    const nome = datiSchedaCandidato(c).nome;
    setErrore(null);
    startTransition(async () => {
      if (tipo === "annulla_match") {
        const r = await riapriCandidatura(c.id);
        if (!r.ok) return setErrore(r.error);
        dopo(c, "in_attesa", `Match annullato: ${nome} è di nuovo tra le candidature da valutare.`);
      } else {
        const res = await valutaCandidatura(c.id, tipo === "match" ? "accettata" : "rifiutata", tipo === "scarta" ? (motivo ?? undefined) : undefined);
        if (res?.error) return setErrore(res.error);
        if (tipo === "match") dopo(c, "accettata", `Match fatto con ${nome}: ora potete scrivervi.`, `/chat/${c.id}`);
        else dopo(c, "rifiutata", `Hai scartato ${nome}: se cambi idea, puoi annullare lo scarto.`);
      }
      chiudiDialogo();
    });
  }

  function annullaScarto(c: CandidaturaRicevuta) {
    setErrore(null);
    startTransition(async () => {
      const r = await riapriCandidatura(c.id);
      if (!r.ok) return setAvviso({ testo: r.error });
      dopo(c, "in_attesa", `Scarto annullato: ${datiSchedaCandidato(c).nome} è di nuovo tra le candidature da valutare.`);
    });
  }

  // ---- le richieste a chi non si è candidato ----
  function chiudiRichiesta() {
    setRichiesta(null);
    setMessaggio("");
    setErrore(null);
  }
  function inviaRichiesta() {
    if (!richiesta) return;
    const { casa, s } = richiesta;
    setErrore(null);
    startTransition(async () => {
      const r = await faiMatch(casa.id, s.tenantId, messaggio);
      if (!r.ok) return setErrore(r.error);
      setAvviso({ testo: `Richiesta inviata a ${s.nome}` });
      chiudiRichiesta();
      setATuttoSchermo(false);
      router.refresh();
    });
  }

  /** I pulsanti di una candidatura, secondo il suo stato */
  function azioni(c: CandidaturaRicevuta) {
    const a = azioniPerStato(stato(c));
    return (
      <>
        {a.faiMatch && (
          <button type="button" className="opp-cta" disabled={pending} onClick={() => apriDialogo("match", c)}>
            Fai match
          </button>
        )}
        {a.apriChat && (
          <Link href={`/chat/${c.id}`} className="opp-cta block text-center">
            Apri chat
          </Link>
        )}
        {a.scarta && (
          <button type="button" className="richieste-secondario" disabled={pending} onClick={() => apriDialogo("scarta", c)}>
            Scarta
          </button>
        )}
        {a.annullaMatch && (
          <button type="button" className="richieste-secondario" disabled={pending} onClick={() => apriDialogo("annulla_match", c)}>
            Annulla match
          </button>
        )}
        {a.annullaScarto && (
          <button type="button" className="richieste-secondario" disabled={pending} onClick={() => annullaScarto(c)}>
            Annulla scarto
          </button>
        )}
      </>
    );
  }

  const casaCorrente = corrente ? casePer.get(corrente.casaId) : undefined;
  const azioniCorrente = !corrente ? null : corrente.candidatura ? (
    azioni(corrente.candidatura)
  ) : corrente.possibile ? (
    <button
      type="button"
      className="opp-cta"
      disabled={pending}
      onClick={() => {
        const casa = possibili.find((p) => p.id === corrente.casaId);
        if (casa && corrente.possibile) setRichiesta({ casa, s: corrente.possibile });
      }}
    >
      Fai match
    </button>
  ) : null;

  return (
    <PageContainer wide>
      <h1 className="screen-title">Database inquilini</h1>
      <p className="screen-sub">
        {candidature.length === 0 && totalePossibili === 0
          ? "Le candidature e i possibili match delle tue case arrivano qui."
          : `${totaleDaValutare} candidatur${totaleDaValutare === 1 ? "a" : "e"} da valutare · ${totalePossibili} possibil${totalePossibili === 1 ? "e match" : "i match"}.`}
      </p>

      {avviso && (
        <div className="possibili-avviso" role="status">
          {avviso.testo}
          {avviso.chat && (
            <Link href={avviso.chat} className="richieste-link">
              Apri la chat ›
            </Link>
          )}
        </div>
      )}

      {gruppi.length === 0 ? (
        <div className="empty-inline">
          <IconPersone className="icon-empty" />
          <h3>Ancora nessuna casa da mostrare</h3>
          <p>Appena una tua casa sarà pubblicata, qui vedrai chi si candida e chi potrebbe fare al caso tuo.</p>
        </div>
      ) : (
        <div className="db-pagina">
          <ElencoDatabase
            box={box}
            ordine={ordine}
            onOrdine={setOrdine}
            filtri={filtri}
            onFiltri={cambiaFiltri}
            conteggi={conteggi}
            conPunteggi={conPunteggi}
            selezionata={corrente?.chiave ?? null}
            onSeleziona={seleziona}
            chiusi={chiusi}
            onCommuta={commuta}
            onTutti={tutti}
            idPossibili={primoConPossibili}
            persone={persone}
            totalePersone={voci.length}
          />
          {corrente && casaCorrente ? (
            <DettaglioPersona
              voce={corrente}
              casa={casaCorrente}
              criterio={ordine.criterio}
              azioni={azioniCorrente}
              modale={aTuttoSchermo}
              onChiudi={() => setATuttoSchermo(false)}
              chiudiRif={chiudiRif}
            />
          ) : (
            <p className="db-dettaglio-vuoto">Nessuna persona da mostrare: cambia la ricerca o i filtri.</p>
          )}
        </div>
      )}

      {/* ---- le conferme: fai match, scarta, annulla match ---- */}
      <Sheet
        open={dialogo !== null}
        onClose={chiudiDialogo}
        title={
          dialogo
            ? dialogo.tipo === "match"
              ? `Fai match con ${datiSchedaCandidato(dialogo.c).nome}?`
              : dialogo.tipo === "scarta"
                ? `Perché scarti ${datiSchedaCandidato(dialogo.c).nome}?`
                : `Annullare il match con ${datiSchedaCandidato(dialogo.c).nome}?`
            : "Conferma"
        }
      >
        {dialogo && (
          <>
            {dialogo.tipo === "match" && (
              <>
                <p className="conferma-testo">Si apre la chat e la persona riceve una notifica. Se cambi idea, potrai annullare il match.</p>
                {dialogo.c.valutazione?.match.bloccato && (
                  <div className="note-stop">Attenzione: non soddisfa un criterio obbligatorio che hai chiesto ({dialogo.c.valutazione.match.mancanti.join(", ")}).</div>
                )}
              </>
            )}
            {dialogo.tipo === "scarta" && (
              <>
                <p className="conferma-testo">La persona leggerà il motivo che scegli. Se cambi idea, potrai annullare lo scarto.</p>
                <div className="chip-row" style={{ marginBottom: 16 }}>
                  {MOTIVI_RIFIUTO.map((m) => (
                    <Chip key={m.chiave} label={m.scelta} active={motivo === m.chiave} onClick={() => setMotivo(m.chiave)} />
                  ))}
                </div>
              </>
            )}
            {dialogo.tipo === "annulla_match" && (
              <p className="conferma-testo">
                La chat si chiude e la persona riceve un avviso: la candidatura torna tra quelle da valutare. I messaggi non si perdono. Se c&apos;è già un contratto o una
                visita in programma, il match non si può annullare.
              </p>
            )}
            {errore && (
              <p className="note-error" role="alert">
                {errore}
              </p>
            )}
            <div className="possibili-conferma">
              <button
                type="button"
                className="opp-cta"
                disabled={pending || (dialogo.tipo === "scarta" && motivo === null)}
                style={dialogo.tipo === "scarta" && motivo ? { background: "var(--clay)" } : undefined}
                onClick={conferma}
              >
                {pending ? "Un momento..." : dialogo.tipo === "match" ? "Sì, fai match" : dialogo.tipo === "scarta" ? "Conferma lo scarto" : "Sì, annulla il match"}
              </button>
              <button type="button" className="richieste-secondario" disabled={pending} onClick={chiudiDialogo}>
                No, torna indietro
              </button>
            </div>
          </>
        )}
      </Sheet>

      {/* ---- la richiesta a chi non si è candidato: prima una conferma, con due parole facoltative ---- */}
      <Sheet open={richiesta !== null} onClose={chiudiRichiesta} title={richiesta ? `Fai match con ${richiesta.s.nome}?` : "Fai match"}>
        {richiesta && (
          <>
            <p className="possibili-testo" style={{ marginTop: 0 }}>
              Le arriverà una richiesta per <b>{richiesta.casa.titolo}</b>. Se accetta, potete scrivervi in chat. Se non risponde o dice di no, non succede niente.
            </p>
            <label className="field-label" htmlFor="messaggio-richiesta">
              Vuoi aggiungere due parole? (facoltativo)
            </label>
            <textarea
              id="messaggio-richiesta"
              className="ob-textarea"
              rows={3}
              maxLength={MESSAGGIO_RICHIESTA_MAX}
              value={messaggio}
              onChange={(e) => setMessaggio(e.target.value)}
              placeholder="Per esempio: la casa è libera da dicembre, può venire a vederla quando vuole."
            />
            <small className="field-note">
              {messaggio.length}/{MESSAGGIO_RICHIESTA_MAX}
            </small>
            {errore && (
              <p className="note-error" role="alert">
                {errore}
              </p>
            )}
            <div className="possibili-conferma">
              <button type="button" className="opp-cta" disabled={pending} onClick={inviaRichiesta}>
                {pending ? "Invio…" : "Sì, invia la richiesta"}
              </button>
              <button type="button" className="richieste-secondario" disabled={pending} onClick={chiudiRichiesta}>
                No, torna indietro
              </button>
            </div>
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}
