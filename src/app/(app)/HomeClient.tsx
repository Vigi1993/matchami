"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { RiepilogoRecensioni } from "@/lib/recensioni";
import type { TenantProfile } from "@/lib/types";
import { DatiPersonaliSheet } from "@/components/DatiPersonaliSheet";
import type { ListingConMatch } from "@/lib/types";
import { TOLLERANZA_BUDGET, statoMazzo } from "@/lib/match";
import type { ProfiloRicerca } from "@/lib/match";
import { chiaveRicerca as chiaveDellaRicerca, conteggioCase, suggerimentoCard, testoNascoste, vociRicerca } from "@/lib/home";
import type { Luogo } from "@/lib/luoghi";
import { Sheet } from "@/components/Sheet";
import { RicercaSheet } from "@/components/RicercaSheet";
import { SchedaAffidabilita } from "@/components/SchedaAffidabilita";
import { candidati } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { messaggioErroreVerifica } from "@/lib/verifica";
import {
  TESTO_DOVE_SONO,
  TESTO_PREFERITO_TOLTO,
  TESTO_SALVATO,
  TESTO_SCARTO_ANNULLATO,
  TITOLO_TUTTI_SCELTI,
  annullaUltima,
  registra,
  svuota,
  ultimaScelta,
  type Scelta,
} from "@/lib/scelte";
import {
  IconChevronSu,
  IconCuore,
  IconX,
  IconCasa,
  IconInfo,
  IconAnnulla,
  IconSegnalibro,
} from "@/components/icons";
import { SchedaImmobile } from "./SchedaImmobile";

const SOGLIA_SWIPE = 100; // px di trascinamento oltre cui la scelta è "decisa"
const SOGLIA_TOCCO = 8; // sotto questo spostamento è un tocco, non un trascinamento

export function HomeClient({
  affidabilita,
  recensioni,
  tenant,
  listings,
  esclusi,
  mostraMatch,
  nascosti = 0,
  ricerca,
  luoghi,
  nascostiPerNecessarie = 0,
}: {
  affidabilita: AffidabilitaResult;
  /** le recensioni dei proprietari, a parte dal punteggio */
  recensioni: RiepilogoRecensioni;
  /** i dati dell'inquilino (per la scheda «Modifica dati») */
  tenant: TenantProfile;
  /** la ricerca impostata: budget, taglio, zone e caratteristiche */
  ricerca: ProfiloRicerca;
  /** i luoghi che si possono cercare (provincia, città, quartiere) */
  luoghi: Luogo[];
  /** quante case non compaiono perché non hanno una caratteristica che hai segnato come necessaria */
  nascostiPerNecessarie?: number;
  /** il mazzo già ordinato: prima gli annunci in ricerca, poi gli altri */
  listings: ListingConMatch[];
  /** annunci tolti perché oltre la tolleranza sul budget */
  esclusi: number;
  /** false se l'inquilino non ha impostato nessun criterio di ricerca */
  mostraMatch: boolean;
  /** annunci disponibili che l'inquilino ha già scartato (di recente) o salvato */
  nascosti?: number;
}) {
  // Il mazzo si congela alla prima visualizzazione. Dopo una candidatura
  // la pagina viene rigenerata dal server senza l'annuncio appena scelto:
  // se il deck seguisse quella lista, il suo indice salterebbe una casa e
  // il punto del separatore si sposterebbe a metà sessione.
  const [mazzo, setMazzo] = useState(listings);
  const [index, setIndex] = useState(0);
  const [separatoreVisto, setSeparatoreVisto] = useState(false);
  const [candidatureInviate, setCandidatureInviate] = useState<Set<string>>(
    new Set()
  );
  const [pending, startTransition] = useTransition();
  // Le scelte fatte in questa sessione, per «annulla»; e l'ultimo avviso mostrato.
  const [storia, setStoria] = useState<Scelta[]>([]);
  const [avviso, setAvviso] = useState<{ errore: boolean; testo: string } | null>(null);

  // ---- stato del trascinamento della card ----
  const [fotoIdx, setFotoIdx] = useState(0);
  const [schedaAperta, setSchedaAperta] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const router = useRouter();
  const [schedaPunteggio, setSchedaPunteggio] = useState(false);
  const [schedaDati, setSchedaDati] = useState(false);
  const [schedaRicerca, setSchedaRicerca] = useState(false);

  // Quando la ricerca CAMBIA (l'ha modificata la persona da qui) il mazzo si ricomincia con quello nuovo, in ordine.
  // Per ogni altro motivo resta congelato. È il modo previsto da React per adattare lo stato a una proprietà che cambia.
  const chiaveRicerca = chiaveDellaRicerca(ricerca);
  const [chiaveVista, setChiaveVista] = useState(chiaveRicerca);
  if (chiaveRicerca !== chiaveVista) {
    setChiaveVista(chiaveRicerca);
    setMazzo(listings);
    setIndex(0);
    setSeparatoreVisto(false);
    setStoria([]);
    setFotoIdx(0);
    setSchedaAperta(false);
    setExiting(null);
    setDrag({ x: 0, y: 0, dragging: false });
  }

  const attuale = mazzo[index];

  // Gli annunci in ricerca sono i primi del mazzo; poi comincia la fascia
  // "oltre la tua ricerca", che si apre con una schermata di passaggio.
  const { inRicerca, oltre, finito, mostraSeparatore } = statoMazzo(
    mazzo.map((l) => l.match.fascia),
    index,
    { mostraMatch, separatoreVisto }
  );
  const oltreBudget = mazzo.filter((l) => l.match.sforoBudgetPct !== null).length;
  const tolleranzaPct = Math.round(TOLLERANZA_BUDGET * 100);

  // Le chiamate di Supabase partono solo se qualcuno ne attende il risultato:
  // il `.then` (o un `await`) è ciò che le fa partire.

  // Scartare è immediato e non si ferma per un errore di rete: se il ricordo non
  // si salva, l'annuncio ricompare un'altra volta, nient'altro.
  function scarta() {
    if (attuale) {
      setStoria((s) => registra(s, { listingId: attuale.id, tipo: "scartato" }));
      createClient()
        .rpc("scarta_annuncio", { p_listing: attuale.id })
        .then(undefined, () => undefined);
    }
    setAvviso(null);
    setIndex((i) => i + 1);
    setFotoIdx(0);
  }

  // Salvare, invece, è una scelta voluta: se non riesce lo si dice e si resta sulla stessa casa.
  function salva() {
    if (!attuale || pending || mostraSeparatore) return;
    const listing = attuale;
    startTransition(async () => {
      let errore: string | null = null;
      try {
        const { error } = await createClient().rpc("salva_preferito", { p_listing: listing.id });
        if (error) errore = messaggioErroreVerifica(error.message);
      } catch {
        errore = messaggioErroreVerifica("");
      }
      if (errore) {
        setAvviso({ errore: true, testo: errore });
        return;
      }
      setStoria((s) => registra(s, { listingId: listing.id, tipo: "preferito" }));
      setAvviso({ errore: false, testo: TESTO_SALVATO });
      setSchedaAperta(false);
      setIndex((i) => i + 1);
      setFotoIdx(0);
    });
  }

  // Torna indietro di una scelta (uno scarto o un salvataggio) e la toglie dal database.
  function annulla() {
    const { storia: nuova, annullata } = annullaUltima(storia);
    if (!annullata || pending) return;
    setStoria(nuova);
    createClient()
      .rpc("annulla_scelta", { p_listing: annullata.listingId })
      .then(undefined, () => undefined);
    setAvviso({ errore: false, testo: annullata.tipo === "preferito" ? TESTO_PREFERITO_TOLTO : TESTO_SCARTO_ANNULLATO });
    setSchedaAperta(false);
    setIndex((i) => Math.max(0, i - 1));
    setFotoIdx(0);
  }

  function candidati_(listing: ListingConMatch) {
    startTransition(async () => {
      const res = await candidati(listing.id);
      if (!res?.error) {
        setCandidatureInviate((prev) => new Set(prev).add(listing.id));
      }
      // una candidatura non si annulla da qui (si ritira da «Candidature»): dopo,
      // «annulla» non torna indietro oltre questo punto
      setStoria(svuota());
      setAvviso(null);
      setIndex((i) => i + 1);
      setFotoIdx(0);
    });
  }

  const puoAnnullare = ultimaScelta(storia) !== null && !pending;

  // Azionata sia dal rilascio del trascinamento sia dai pulsanti: fa
  // "volare via" la card nella direzione scelta, poi passa alla prossima.
  function swipe(direzione: "left" | "right") {
    if (!attuale || pending || mostraSeparatore) return;
    setSchedaAperta(false);
    setExiting(direzione);
    setTimeout(() => {
      if (direzione === "right") candidati_(attuale);
      else scarta();
      setDrag({ x: 0, y: 0, dragging: false });
      setExiting(null);
    }, 220);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return;
    // I pulsanti dentro la card (i dettagli) si toccano da soli: niente trascinamento e niente cattura del puntatore.
    // Con la cattura il clic finisce sulla card, e il dito non può aprire nulla.
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, dragging: true });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.dragging) return;
    setDrag({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y,
      dragging: true,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.dragging) return;

    if (drag.x > SOGLIA_SWIPE) {
      swipe("right");
      return;
    }
    if (drag.x < -SOGLIA_SWIPE) {
      swipe("left");
      return;
    }

    // Spostamento minimo: è stato un tocco. I lati scorrono le foto; il centro non fa niente
    // (i dettagli si aprono dal pulsante «Tutte le foto e i dettagli»).
    if (
      Math.abs(drag.x) < SOGLIA_TOCCO &&
      Math.abs(drag.y) < SOGLIA_TOCCO
    ) {
      const rect = e.currentTarget.getBoundingClientRect();
      const posizione = (e.clientX - rect.left) / rect.width;
      if (posizione < 0.32) fotoPrecedente();
      else if (posizione > 0.68) fotoSuccessiva();
    }

    setDrag({ x: 0, y: 0, dragging: false });
  }

  function fotoPrecedente() {
    setFotoIdx((i) => (i > 0 ? i - 1 : i));
  }

  function fotoSuccessiva() {
    setFotoIdx((i) => (i < numeroFoto - 1 ? i + 1 : i));
  }

  const rotazione = drag.x / 18;
  const transformStyle =
    exiting === "right"
      ? "translate(160%, 40px) rotate(28deg)"
      : exiting === "left"
        ? "translate(-160%, 40px) rotate(-28deg)"
        : `translate(${drag.x}px, ${drag.y}px) rotate(${rotazione}deg)`;
  const likeOpacity = Math.min(Math.max(drag.x / SOGLIA_SWIPE, 0), 1);
  const nopeOpacity = Math.min(Math.max(-drag.x / SOGLIA_SWIPE, 0), 1);

  const testoCase = conteggioCase({ mostraMatch, inRicerca, oltre, totale: mazzo.length });
  const riassuntoRicerca = vociRicerca(ricerca);
  const foto = attuale?.listing_photos ?? [];
  const numeroFoto = foto.length;
  const fotoCorrente = foto[Math.min(fotoIdx, Math.max(numeroFoto - 1, 0))]?.url;
  const fotoSuccessivaUrl = foto[fotoIdx + 1]?.url;

  return (
    <div className="screen-dark">
      {/* ---- Barra in alto: marchio e contatore ---- */}
      <div className="topbar">
        <div className="brand">
          Match<b>AmI</b>
        </div>
        {mazzo.length > 0 && !finito && (
          <div className="counter">
            {index + 1} / {mazzo.length}
          </div>
        )}
      </div>

      {/* ---- In alto: il punteggio (si tocca per vedere da cosa è fatto) e le case della ricerca ---- */}
      <div className="home-intro">
        <div className="hi-punteggio" role="group" aria-label={`Affidabilità ${affidabilita.punteggio} su 100, ${affidabilita.label}`}>
          <AnelloPunteggio punteggio={affidabilita.punteggio} />
          <span className="hi-punteggio-testo">
            <span className="hi-punteggio-titolo">La tua affidabilità</span>
            <b>{affidabilita.label}</b>
          </span>
          <span className="hi-punteggio-azioni">
            <button type="button" className="hi-azione" onClick={() => setSchedaPunteggio(true)}>
              Come si calcola
            </button>
            <button type="button" className="hi-azione" onClick={() => setSchedaDati(true)}>
              Modifica dati
            </button>
          </span>
        </div>
        <div className="hi-ricerca">
          <div className="hi-ricerca-testo">
            <b>{testoCase.principale}</b>
            {testoCase.secondario && <span>{testoCase.secondario}</span>}
            {testoNascoste(nascostiPerNecessarie) && <span className="hi-nascoste">{testoNascoste(nascostiPerNecessarie)}</span>}
          </div>
          <button type="button" className="hi-modifica" onClick={() => setSchedaRicerca(true)}>
            {mostraMatch ? "Modifica ricerca" : "Imposta la ricerca"}
          </button>
        </div>
        {mostraMatch && riassuntoRicerca.length > 0 && <div className="hi-riassunto">{riassuntoRicerca.join(" · ")}</div>}
      </div>

      <div className="deck">
        {/* ---- Nessun annuncio ---- */}
        {mazzo.length === 0 && (
          <div className="empty-state">
            <div className="ring">
              <IconCasa className="icon-ring" />
            </div>
            <h2>
              {nascosti > 0
                ? TITOLO_TUTTI_SCELTI
                : nascostiPerNecessarie > 0
                  ? "Nessuna casa con le tue caratteristiche necessarie"
                  : esclusi > 0
                  ? "Nessuna casa nel tuo budget"
                  : "Nessun annuncio per la tua ricerca"}
            </h2>
            <p>
              {nascosti > 0
                ? TESTO_DOVE_SONO
                : nascostiPerNecessarie > 0
                  ? `Ho nascosto ${nascostiPerNecessarie} ${nascostiPerNecessarie === 1 ? "casa" : "case"} perché non ${nascostiPerNecessarie === 1 ? "ha" : "hanno"} le caratteristiche che hai segnato come necessarie. Puoi renderne opzionale qualcuna da «Modifica ricerca».`
                  : esclusi > 0
                ? `Ci sono ${esclusi} ${esclusi === 1 ? "casa" : "case"} oltre il ${tolleranzaPct}% del tuo budget, che non ti mostriamo. Se vuoi vederle, alza il budget da «Modifica ricerca».`
                : "Appena ci saranno immobili pubblicati che rientrano nei tuoi criteri, li vedrai qui. Nel frattempo puoi aggiornare i criteri da «Modifica ricerca»."}
            </p>
            {nascosti === 0 && (
              <button type="button" className="opp-cta" onClick={() => setSchedaRicerca(true)}>
                Modifica la ricerca
              </button>
            )}
          </div>
        )}

        {/* ---- Deck esaurito ---- */}
        {mazzo.length > 0 && finito && (
          <div className="empty-state">
            <div className="ring">
              <IconCuore className="icon-ring" />
            </div>
            <h2>Hai visto tutti gli annunci disponibili</h2>
            <p>
              Torna più tardi: ne arrivano di nuovi appena vengono pubblicati.{" "}
              {TESTO_DOVE_SONO}
              {nascostiPerNecessarie > 0 && ` ${testoNascoste(nascostiPerNecessarie)}.`}
              {esclusi > 0 &&
                ` Altre ${esclusi} ${esclusi === 1 ? "casa è" : "case sono"} oltre il ${tolleranzaPct}% del tuo budget e non te ${esclusi === 1 ? "la" : "le"} mostriamo: se vuoi vederle, aggiorna il budget in Profilo.`}
            </p>
            {puoAnnullare && (
              <button type="button" className="link-quiet" onClick={annulla}>
                Annulla l&apos;ultima scelta
              </button>
            )}
          </div>
        )}

        {/* ---- Passaggio tra "in linea" e "oltre la ricerca" ---- */}
        {mostraSeparatore && (
          <div className="empty-state">
            <div className="ring">
              <IconChevronSu className="icon-ring" />
            </div>
            <h2>
              {inRicerca > 0
                ? "Hai visto le case in linea con la tua ricerca"
                : "Nessuna casa rispetta tutti i tuoi criteri"}
            </h2>
            <p>
              {descriviOltre(oltre, oltreBudget, tolleranzaPct, inRicerca > 0)} Puoi
              guardarle comunque: le trovi segnate come &quot;oltre la tua ricerca&quot;.
            </p>
            <button
              type="button"
              className="opp-cta"
              onClick={() => setSeparatoreVisto(true)}
            >
              Vedi le altre case
            </button>
            <button type="button" className="link-quiet" onClick={() => setSchedaRicerca(true)}>
              Modifica la tua ricerca
            </button>
            {puoAnnullare && (
              <button type="button" className="link-quiet" onClick={annulla}>
                Annulla l&apos;ultima scelta
              </button>
            )}
          </div>
        )}

        {/* ---- Card corrente (trascinabile) ---- */}
        {attuale && !finito && !mostraSeparatore && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: transformStyle,
              transition: drag.dragging ? "none" : "transform 0.22s ease-out",
            }}
            className="card"
          >
            {fotoCorrente ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoCorrente}
                  alt={`${attuale.titolo}, foto ${fotoIdx + 1} di ${numeroFoto}`}
                  draggable={false}
                  className="photo"
                />
                {/* scarica in anticipo la prossima, così non lampeggia */}
                {fotoSuccessivaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoSuccessivaUrl} alt="" hidden />
                )}
              </>
            ) : (
              <div className="photo-placeholder">
                <span>{attuale.titolo.slice(0, 2).toUpperCase()}</span>
              </div>
            )}

            {/* un segmento per foto */}
            {numeroFoto > 1 && (
              <div className="photo-dots">
                {foto.map((f, i) => (
                  <i key={f.url} className={i === fotoIdx ? "on" : ""} />
                ))}
              </div>
            )}

            <div className="scrim-top" />
            <div className="scrim-bottom" />

            {/* Timbri, sfumano mentre trascini */}
            <div className="stamp like" style={{ opacity: likeOpacity }}>
              Mi interessa
            </div>
            <div className="stamp nope" style={{ opacity: nopeOpacity }}>
              Passo
            </div>

            <div className="card-info">
              {mostraMatch && (
                <div className="match-row">
                  <span
                    className={`match-pill ${
                      attuale.match.fascia === "oltre_ricerca" ? "oltre" : ""
                    }`}
                  >
                    <b>{attuale.match.punteggio}%</b>
                    {attuale.match.etichetta}
                  </span>
                  {attuale.match.fascia === "oltre_ricerca" && (
                    <span className="match-tag">Oltre la tua ricerca</span>
                  )}
                </div>
              )}
              <div className="zona">{attuale.zona}</div>
              <h1>{attuale.titolo}</h1>
              <div className="meta-row">
                <span className="price">
                  €{attuale.prezzo.toLocaleString("it-IT")}
                  <span> /mese</span>
                </span>
                {attuale.locali && <span>{attuale.locali} locali</span>}
                {attuale.mq && <span>{attuale.mq} m²</span>}
              </div>

              {mostraMatch && attuale.match.motivi.length > 0 && (
                <div className="match-motivi">
                  {attuale.match.motivi.join(" · ")}
                </div>
              )}

              <button
                type="button"
                className="card-dettagli"
                onClick={() => setSchedaAperta(true)}
              >
                <IconInfo />
                Tutte le foto e i dettagli
              </button>
            </div>

            <div className="swipe-hint">
              <span>{suggerimentoCard(numeroFoto)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- Pulsanti scarta / candidati ---- */}
      {attuale && !finito && !mostraSeparatore && (
        <div className="actions">
          <button
            className="btn-undo"
            onClick={annulla}
            disabled={!puoAnnullare}
            aria-label="Annulla l'ultima scelta"
          >
            <IconAnnulla />
          </button>
          <button
            className="btn-pass"
            onClick={() => swipe("left")}
            disabled={pending}
            aria-label="Scarta"
          >
            <IconX />
          </button>
          <button
            className="btn-save"
            onClick={salva}
            disabled={pending}
            aria-label="Salva nei preferiti"
          >
            <IconSegnalibro />
          </button>
          <button
            className="btn-like"
            onClick={() => swipe("right")}
            disabled={pending}
            aria-label="Candidati"
          >
            <IconCuore />
          </button>
        </div>
      )}

      <Sheet open={schedaPunteggio} onClose={() => setSchedaPunteggio(false)} title="Il tuo voto di affidabilità">
        <SchedaAffidabilita
          affidabilita={affidabilita}
          recensioni={recensioni}
          onApri={(sezione) => {
            setSchedaPunteggio(false);
            // i dati si cambiano qui; la verifica del reddito ha la sua pagina (carica i documenti)
            if (sezione === "dati") setSchedaDati(true);
            else router.push("/profilo?apri=verifica");
          }}
        />
      </Sheet>

      {/* Come la ricerca: montata solo quando è aperta, così ogni apertura parte dai dati di adesso. */}
      {schedaDati && (
        <DatiPersonaliSheet
          open
          onClose={() => setSchedaDati(false)}
          tenant={tenant}
          onSalvata={() => {
            setSchedaDati(false);
            setAvviso({ errore: false, testo: "Dati aggiornati." });
          }}
        />
      )}

      {/* Montata solo quando è aperta: ogni apertura parte dai valori di adesso, e quando i dati nuovi arrivano
          non viene smontata prima di aver detto «salvato». */}
      {schedaRicerca && (
        <RicercaSheet
          open
          onClose={() => setSchedaRicerca(false)}
          ricerca={ricerca}
          luoghi={luoghi}
          onSalvata={() => {
            setSchedaRicerca(false);
            setAvviso({ errore: false, testo: "Ricerca aggiornata." });
          }}
        />
      )}

      <SchedaImmobile
        listing={schedaAperta ? attuale : null}
        mostraMatch={mostraMatch}
        onClose={() => setSchedaAperta(false)}
        onPassa={() => swipe("left")}
        onSalva={salva}
        onCandidati={() => swipe("right")}
        inCorso={pending}
      />

      {avviso && (
        <div className={`toast-inline ${avviso.errore ? "is-no" : ""}`} role={avviso.errore ? "alert" : "status"}>
          {avviso.testo}
        </div>
      )}

      {!avviso && candidatureInviate.size > 0 && (
        <div className="toast-inline">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </div>
      )}
    </div>
  );
}

/** Il punteggio come numero dentro un anello che si riempie (da 0 a 100). */
function AnelloPunteggio({ punteggio }: { punteggio: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  const pieno = (Math.max(0, Math.min(100, punteggio)) / 100) * c;
  return (
    <svg className="hi-anello" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} className="hi-anello-fondo" />
      <circle cx="32" cy="32" r={r} className="hi-anello-pieno" strokeDasharray={`${pieno} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="33" className="hi-anello-num" textAnchor="middle" dominantBaseline="central">
        {punteggio}
      </text>
    </svg>
  );
}

/** Frase che spiega perché le case che restano si discostano dalla ricerca. */
function descriviOltre(
  oltre: number,
  oltreBudget: number,
  tolleranzaPct: number,
  haAltre: boolean
): string {
  const altre = oltre - oltreBudget;
  const quante =
    oltre === 1
      ? haAltre
        ? "Ce n'è un'altra"
        : "Ce n'è una"
      : haAltre
        ? `Ce ne sono altre ${oltre}`
        : `Ce ne sono ${oltre}`;

  if (oltreBudget > 0 && altre > 0) {
    return `${quante} che si discostano un po': ${oltreBudget} sopra il budget (al massimo del ${tolleranzaPct}%), ${altre} che ${altre === 1 ? "non rispetta" : "non rispettano"} zona, locali o metratura.`;
  }
  if (oltreBudget > 0) {
    return `${quante}, sopra il tuo budget di non più del ${tolleranzaPct}%.`;
  }
  return `${quante} che ${oltre === 1 ? "non rispetta" : "non rispettano"} zona, locali o metratura.`;
}
