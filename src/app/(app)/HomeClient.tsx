"use client";

import { useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

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

  return (
    <PageContainer>
      {/* ---- Barra affidabilità + conteggio ---- */}
      <div className="bg-ink text-paper rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-display font-bold text-gold">
            {affidabilita.punteggio}
          </div>
          <div className="text-[10px] text-paper/60 leading-tight">
            Affidabilità
            <br />
            <b className="text-paper">{affidabilita.label}</b>
          </div>
        </div>
        <div className="text-right text-[10px] text-paper/80 leading-tight">
          <b className="text-paper text-base">{listings.length}</b> casa
          {listings.length === 1 ? "" : "e"} in linea
          <br />
          con la tua ricerca
        </div>
      </div>

      {/* ---- Nessun annuncio ---- */}
      {listings.length === 0 && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <div className="w-11 h-11 rounded-full bg-gold/20 mx-auto mb-3" />
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessun annuncio in linea con la tua ricerca
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena ci saranno immobili pubblicati che rientrano nei tuoi
            criteri, li vedrai qui. Nel frattempo puoi aggiornare i criteri
            in Profilo → La tua ricerca.
          </p>
        </div>
      )}

      {/* ---- Deck esaurito ---- */}
      {listings.length > 0 && finito && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Hai visto tutti gli annunci disponibili
          </h3>
          <p className="text-xs text-ink/50">
            Torna più tardi: ne arrivano di nuovi appena vengono pubblicati.
          </p>
        </div>
      )}

      {/* ---- Card corrente ---- */}
      {attuale && !finito && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-3xl overflow-hidden bg-ink h-[420px]">
            {attuale.listing_photos?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attuale.listing_photos[0].url}
                alt={attuale.titolo}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display italic text-5xl text-paper/15">
                  {attuale.titolo.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-4">
              <div className="font-display font-bold text-paper">
                {attuale.titolo}
              </div>
              <div className="text-xs text-paper/70">
                {attuale.zona} · €{attuale.prezzo.toLocaleString("it-IT")}/mese
                {attuale.locali && ` · ${attuale.locali} locali`}
                {attuale.mq && ` · ${attuale.mq} m²`}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={scarta}
              disabled={pending}
              aria-label="Scarta"
              className="w-14 h-14 rounded-full border-2 border-clay text-clay flex items-center justify-center text-2xl disabled:opacity-50"
            >
              ✕
            </button>
            <button
              onClick={() => candidati_(attuale)}
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

      {candidatureInviate.size > 0 && (
        <p className="text-center text-xs text-moss mt-4">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </p>
      )}
    </PageContainer>
  );
}
