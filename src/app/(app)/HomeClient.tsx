"use client";

import { useRef, useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";
import { IconChevronSu, IconCuore, IconX, IconCasa } from "@/components/icons";

const SOGLIA_SWIPE = 100; // px di trascinamento oltre cui la scelta è "decisa"

export function HomeClient({
  affidabilita,
  listings,
}: {
  affidabilita: AffidabilitaResult;
  listings: ListingConFoto[];
}) {
  const [index, setIndex] = useState(0);
  const [candidatureInviate, setCandidatureInviate] = useState<Set<string>>(
    new Set()
  );
  const [pending, startTransition] = useTransition();

  // ---- stato del trascinamento della card ----
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const attuale = listings[index];
  const finito = index >= listings.length;

  function scarta() {
    setIndex((i) => i + 1);
  }

  function candidati_(listing: ListingConFoto) {
    startTransition(async () => {
      const res = await candidati(listing.id);
      if (!res?.error) {
        setCandidatureInviate((prev) => new Set(prev).add(listing.id));
      }
      setIndex((i) => i + 1);
    });
  }

  // Azionata sia dal rilascio del trascinamento sia dai pulsanti: fa
  // "volare via" la card nella direzione scelta, poi passa alla prossima.
  function swipe(direzione: "left" | "right") {
    if (!attuale || pending) return;
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

  function onPointerUp() {
    if (!drag.dragging) return;
    if (drag.x > SOGLIA_SWIPE) swipe("right");
    else if (drag.x < -SOGLIA_SWIPE) swipe("left");
    else setDrag({ x: 0, y: 0, dragging: false });
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

  const foto = attuale?.listing_photos?.[0]?.url;

  return (
    <div className="screen-dark">
      {/* ---- Barra in alto: marchio e contatore ---- */}
      <div className="topbar">
        <div className="brand">
          Match<b>AmI</b>
        </div>
        {listings.length > 0 && !finito && (
          <div className="counter">
            {index + 1} / {listings.length}
          </div>
        )}
      </div>

      {/* ---- Riquadro affidabilità + case in linea ---- */}
      <div className="home-intro">
        <div className="hi-top">
          <div className="hi-score">
            <div className="hi-score-num">{affidabilita.punteggio}</div>
            <div className="hi-score-label">
              Affidabilità
              <br />
              <b style={{ color: "var(--paper)" }}>{affidabilita.label}</b>
            </div>
          </div>
          <div className="hi-count">
            <b>{listings.length}</b>
            casa{listings.length === 1 ? "" : "e"} in linea
            <br />
            con la tua ricerca
          </div>
        </div>
      </div>

      <div className="deck">
        {/* ---- Nessun annuncio ---- */}
        {listings.length === 0 && (
          <div className="empty-state">
            <div className="ring">
              <IconCasa
                className="icon-ring"
              />
            </div>
            <h2>Nessun annuncio in linea con la tua ricerca</h2>
            <p>
              Appena ci saranno immobili pubblicati che rientrano nei tuoi
              criteri, li vedrai qui. Nel frattempo puoi aggiornare i criteri
              in Profilo → La tua ricerca.
            </p>
          </div>
        )}

        {/* ---- Deck esaurito ---- */}
        {listings.length > 0 && finito && (
          <div className="empty-state">
            <div className="ring">
              <IconCuore
                className="icon-ring"
              />
            </div>
            <h2>Hai visto tutti gli annunci disponibili</h2>
            <p>
              Torna più tardi: ne arrivano di nuovi appena vengono pubblicati.
            </p>
          </div>
        )}

        {/* ---- Card corrente (trascinabile) ---- */}
        {attuale && !finito && (
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
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto}
                alt={attuale.titolo}
                draggable={false}
                className="photo"
              />
            ) : (
              <div className="photo-placeholder">
                <span>{attuale.titolo.slice(0, 2).toUpperCase()}</span>
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
            </div>

            <div className="swipe-hint">
              <IconChevronSu className="w-5 h-5 fill-none stroke-current stroke-2" />
              <span>Trascina per scegliere</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- Pulsanti scarta / candidati ---- */}
      {attuale && !finito && (
        <div className="actions">
          <button
            className="btn-pass"
            onClick={() => swipe("left")}
            disabled={pending}
            aria-label="Scarta"
          >
            <IconX />
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

      {candidatureInviate.size > 0 && (
        <div className="toast-inline">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </div>
      )}
    </div>
  );
}
