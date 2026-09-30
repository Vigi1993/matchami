"use client";

import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB } from "@/lib/constants";
import type { ListingConFoto } from "@/lib/types";

/**
 * Tutto quello che si sa di un immobile, aperto dal mazzo prima di
 * decidere. I due pulsanti in fondo fanno le stesse cose dei pulsanti
 * sulla card: chiudono la scheda e passano alla casa successiva.
 */
export function SchedaImmobile({
  listing,
  onClose,
  onPassa,
  onCandidati,
  inCorso,
}: {
  listing: ListingConFoto | null;
  onClose: () => void;
  onPassa: () => void;
  onCandidati: () => void;
  inCorso: boolean;
}) {
  if (!listing) return null;

  const foto = listing.listing_photos ?? [];
  const attributi = listing.attributi ?? {};
  const presenti = ATTR_VOCAB.filter((a) => attributi[a.key]);

  return (
    <Sheet open onClose={onClose} title={listing.titolo}>
      <p className="sheet-sub">
        {listing.zona} · €{listing.prezzo.toLocaleString("it-IT")} al mese
      </p>

      {foto.length > 0 ? (
        <div className="galleria">
          {foto.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.url}
              src={f.url}
              alt={`${listing.titolo}, foto ${i + 1} di ${foto.length}`}
            />
          ))}
        </div>
      ) : (
        <div className="galleria-vuota">
          Questo annuncio non ha ancora foto
        </div>
      )}

      <Riga etichetta="Canone" valore={`€${listing.prezzo.toLocaleString("it-IT")} / mese`} />
      <Riga etichetta="Zona" valore={listing.zona} />
      <Riga
        etichetta="Locali"
        valore={listing.locali ? String(listing.locali) : "Non indicato"}
      />
      <Riga
        etichetta="Superficie"
        valore={listing.mq ? `${listing.mq} m²` : "Non indicata"}
      />
      {listing.locali && listing.mq && (
        <Riga
          etichetta="Media per locale"
          valore={`${Math.round(listing.mq / listing.locali)} m²`}
        />
      )}

      {listing.descrizione && (
        <div style={{ marginTop: 22 }}>
          <div className="pref-label">
            <span>Descrizione</span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.65,
              color: "var(--body-text)",
            }}
          >
            {listing.descrizione}
          </p>
        </div>
      )}

      {presenti.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="pref-label">
            <span>Caratteristiche</span>
          </div>
          <div className="match-checklist">
            {presenti.map((a) => (
              <span key={a.key} className="ok">
                {a.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="scheda-azioni">
        <button
          type="button"
          onClick={onPassa}
          disabled={inCorso}
          className="btn-danger-outline"
        >
          Passo
        </button>
        <button
          type="button"
          onClick={onCandidati}
          disabled={inCorso}
          className="opp-cta"
        >
          Mi interessa
        </button>
      </div>

      <p className="field-note" style={{ marginTop: 12 }}>
        Candidandoti il proprietario riceve il tuo profilo e decide se
        accettarti.
      </p>
    </Sheet>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="feat-row">
      <span className="k">{etichetta}</span>
      <span className="v">{valore}</span>
    </div>
  );
}
