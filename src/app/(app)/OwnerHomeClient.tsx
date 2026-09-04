import Link from "next/link";
import type { ListingProprietario } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";

export function OwnerHomeClient({
  listings,
  totaleCandidature,
  daValutare,
}: {
  listings: ListingProprietario[];
  totaleCandidature: number;
  daValutare: number;
}) {
  return (
    <PageContainer wide>
      <h1 className="font-display text-xl text-ink mb-1">Home</h1>
      <p className="text-xs text-ink/50 mb-6">
        Il riepilogo dei tuoi annunci e delle candidature ricevute.
      </p>

      {/* ---- Statistiche ---- */}
      <div className="bg-ink text-paper rounded-2xl p-4 mb-6 flex items-center justify-between">
        <Stat value={totaleCandidature} label="candidature ricevute" />
        <Stat value={daValutare} label="da valutare ora" highlight />
        <Stat value={listings.length} label="immobili pubblicati" />
      </div>

      {daValutare > 0 && (
        <Link
          href="/database"
          className="block bg-gold text-ink font-bold text-sm text-center py-3 rounded-xl mb-6"
        >
          Vai al Database — {daValutare} da valutare
        </Link>
      )}

      {/* ---- I tuoi immobili ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi immobili {listings.length > 0 && `· ${listings.length}`}
      </div>

      {listings.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Non hai ancora pubblicato nessun immobile
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            La pubblicazione di un nuovo annuncio arriva in un prossimo
            passo (schermata Immobili).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {listings.map((l) => (
            <div
              key={l.id}
              className="bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {l.titolo}
                </span>
                {!l.pubblicato && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-ink/10 text-ink/50">
                    Non pubblicato
                  </span>
                )}
              </div>
              <div className="text-xs text-ink/50">
                {l.zona} · €{l.prezzo.toLocaleString("it-IT")}/mese
                {l.nCandidature > 0 && ` · ${l.nCandidature} candidatur${l.nCandidature === 1 ? "a" : "e"}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function Stat({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-2xl font-display font-bold ${highlight ? "text-gold" : "text-paper"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-paper/60 leading-tight max-w-[70px]">
        {label}
      </div>
    </div>
  );
}
