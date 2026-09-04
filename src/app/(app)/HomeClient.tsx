"use client";

import { useRef, useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

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

  return (
    <PageContainer>
      <div className="md:grid md:grid-cols-[300px_1fr] md:gap-10 md:items-start">
        {/* ---- Colonna sinistra su desktop: affidabilità + conteggio, resta visibile mentre scorri ---- */}
        <div className="bg-ink text-paper rounded-2xl p-5 mb-6 md:mb-0 md:p-7 md:sticky md:top-10">
          <div className="flex items-center justify-between md:flex-col md:items-start md:gap-8">
            <div>
              <div className="text-2xl md:text-5xl font-display font-bold text-gold">
                {affidabilita.punteggio}
              </div>
              <div className="text-[10px] md:text-sm text-paper/60 leading-tight mt-1">
                Affidabilità
                <br />
                <b className="text-paper">{affidabilita.label}</b>
              </div>
            </div>
            <div className="text-right md:text-left text-[10px] md:text-sm text-paper/80 leading-tight">
              <b className="text-paper text-base md:text-3xl md:block md:mb-1">
                {listings.length}
              </b>{" "}
              casa{listings.length === 1 ? "" : "e"} in linea
              <br />
              con la tua ricerca
            </div>
          </div>
        </div>

        {/* ---- Colonna destra su desktop: stato vuoto / esaurito / card corrente ---- */}
        <div>
          {/* ---- Nessun annuncio ---- */}
          {listings.length === 0 && (
            <div className="bg-ink/5 rounded-2xl p-5 md:p-10 text-center">
              <div className="w-11 h-11 rounded-full bg-gold/20 mx-auto mb-3" />
              <h3 className="font-display font-bold text-sm md:text-base text-ink mb-1">
                Nessun annuncio in linea con la tua ricerca
              </h3>
              <p className="text-xs md:text-sm text-ink/50 max-w-xs mx-auto">
                Appena ci saranno immobili pubblicati che rientrano nei tuoi
                criteri, li vedrai qui. Nel frattempo puoi aggiornare i
                criteri in Profilo → La tua ricerca.
              </p>
            </div>
          )}

          {/* ---- Deck esaurito ---- */}
          {listings.length > 0 && finito && (
            <div className="bg-ink/5 rounded-2xl p-5 md:p-10 text-center">
              <h3 className="font-display font-bold text-sm md:text-base text-ink mb-1">
                Hai visto tutti gli annunci disponibili
              </h3>
              <p className="text-xs md:text-sm text-ink/50">
                Torna più tardi: ne arrivano di nuovi appena vengono
                pubblicati.
              </p>
            </div>
          )}

          {/* ---- Card corrente (trascinabile) ---- */}
          {attuale && !finito && (
            <div className="flex flex-col gap-4 md:max-w-md md:mx-auto">
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: transformStyle,
                  transition: drag.dragging
                    ? "none"
                    : "transform 0.22s ease-out",
                  touchAction: "pan-y",
                }}
                className="relative rounded-3xl overflow-hidden bg-ink h-[420px] md:h-[540px] cursor-grab active:cursor-grabbing select-none"
              >
                {attuale.listing_photos?.[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attuale.listing_photos[0].url}
                    alt={attuale.titolo}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="font-display italic text-5xl text-paper/15">
                      {attuale.titolo.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Timbri LIKE / NOPE, sfumano mentre trascini */}
                <div
                  style={{ opacity: likeOpacity }}
                  className="absolute top-6 left-6 border-4 border-moss text-moss font-display font-bold text-2xl px-3 py-1 rounded-xl -rotate-12 pointer-events-none"
                >
                  MI PIACE
                </div>
                <div
                  style={{ opacity: nopeOpacity }}
                  className="absolute top-6 right-6 border-4 border-clay text-clay font-display font-bold text-2xl px-3 py-1 rounded-xl rotate-12 pointer-events-none"
                >
                  NO
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-4 md:p-6 pointer-events-none">
                  <div className="font-display font-bold text-paper md:text-lg">
                    {attuale.titolo}
                  </div>
                  <div className="text-xs md:text-sm text-paper/70">
                    {attuale.zona} · €{attuale.prezzo.toLocaleString("it-IT")}
                    /mese
                    {attuale.locali && ` · ${attuale.locali} locali`}
                    {attuale.mq && ` · ${attuale.mq} m²`}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => swipe("left")}
                  disabled={pending}
                  aria-label="Scarta"
                  className="w-14 h-14 rounded-full border-2 border-clay text-clay flex items-center justify-center text-2xl disabled:opacity-50"
                >
                  ✕
                </button>
                <button
                  onClick={() => swipe("right")}
                  disabled={pending}
                  aria-label="Candidati"
                  className="w-16 h-16 rounded-full bg-moss text-paper flex items-center justify-center text-2xl disabled:opacity-50"
                >
                  ♥
                </button>
              </div>
              <p className="text-center text-[11px] text-ink/40">
                {index + 1} di {listings.length}
              </p>
            </div>
          )}
        </div>
      </div>

      {candidatureInviate.size > 0 && (
        <p className="text-center text-xs text-moss mt-4">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </p>
      )}
    </PageContainer>
  );
}
