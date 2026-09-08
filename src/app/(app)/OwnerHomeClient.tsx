import Link from "next/link";
import type { ListingProprietario } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconPalazzo } from "@/components/icons";

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
      <h1 className="screen-title">La tua area proprietario</h1>
      <p className="screen-sub">
        Il riepilogo dei tuoi annunci e delle candidature ricevute.
      </p>

      {/* ---- Statistiche ---- */}
      <div className="stat-grid">
        <Stat value={totaleCandidature} label="candidature ricevute" />
        <Stat value={daValutare} label="da valutare ora" highlight />
        <Stat value={listings.length} label="immobili pubblicati" />
      </div>

      {daValutare > 0 && (
        <Link
          href="/database"
          className="opp-cta block text-center"
          style={{ marginBottom: 26 }}
        >
          Vai al Database — {daValutare} da valutare
        </Link>
      )}

      {/* ---- I tuoi immobili ---- */}
      <div className="pref-label">
        <span>
          I tuoi immobili {listings.length > 0 && `· ${listings.length}`}
        </span>
      </div>

      {listings.length === 0 ? (
        <div className="empty-inline">
          <IconPalazzo className="icon-empty" />
          <h3>Non hai ancora pubblicato nessun immobile</h3>
          <p>
            La pubblicazione di un nuovo annuncio si fa dalla schermata
            Immobili.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {listings.map((l) => (
            <div key={l.id} className="match-card" style={{ cursor: "default" }}>
              <div className="mc-avatar">
                {l.titolo.slice(0, 2).toUpperCase()}
              </div>
              <div className="mc-body">
                <div className="mc-zona">{l.zona}</div>
                <div className="mc-title">{l.titolo}</div>
                <div className="mc-meta">
                  €{l.prezzo.toLocaleString("it-IT")}/mese
                  {!l.pubblicato && " · non pubblicato"}
                </div>
              </div>
              <div
                className={`mc-pct ${
                  l.nCandidature > 0 ? "is-match" : "is-off"
                }`}
              >
                {l.nCandidature > 0 ? (
                  <>
                    {l.nCandidature}
                    <span>
                      candidatur{l.nCandidature === 1 ? "a" : "e"}
                    </span>
                  </>
                ) : (
                  "Nessuna candidatura"
                )}
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
    <div className="stat-card">
      <div className="v" style={highlight ? { color: "var(--gold)" } : undefined}>
        {value}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}
