"use client";

import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB } from "@/lib/constants";
import type { ListingConMatch } from "@/lib/types";

/**
 * Tutto quello che si sa di un immobile, aperto dal mazzo prima di
 * decidere. I due pulsanti in fondo fanno le stesse cose dei pulsanti
 * sulla card: chiudono la scheda e passano alla casa successiva.
 */
export function SchedaImmobile({
  listing,
  mostraMatch,
  onClose,
  onPassa,
  onCandidati,
  inCorso,
}: {
  listing: ListingConMatch | null;
  /** false se l'inquilino non ha impostato criteri: la percentuale non dice nulla */
  mostraMatch: boolean;
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

      {mostraMatch && <PercheMatch match={listing.match} />}

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

const SIMBOLO = { ok: "✓", no: "–", non_indicato: "?" } as const;

/**
 * "Perché vedi questo numero": la percentuale, i criteri soddisfatti e
 * non, e cosa manca. Senza questa spiegazione la percentuale è solo un
 * numero da fidarsi; con questa l'inquilino può contraddirla.
 */
function PercheMatch({ match }: { match: ListingConMatch["match"] }) {
  const oltre = match.fascia === "oltre_ricerca";

  return (
    <div className="match-box">
      <div className="match-box-top">
        <div className="match-box-pct">{match.punteggio}%</div>
        <div>
          <div className="match-box-label">{match.etichetta}</div>
          <div className="match-box-sub">
            Per te, in base ai criteri che hai impostato
          </div>
        </div>
      </div>

      {oltre && (
        <div className="note-wait" style={{ marginBottom: 12 }}>
          Oltre la tua ricerca: {match.motivi.join(", ").toLowerCase()}.
        </div>
      )}

      {match.criteri.length > 0 && (
        <div className="perche-lista">
          {match.criteri.map((c) => (
            <div key={c.chiave} className={`perche-row ${c.stato}`}>
              <span className="perche-simbolo">{SIMBOLO[c.stato]}</span>
              <span className="perche-testo">
                {c.etichetta}
                {c.dettaglio && <small>{c.dettaglio}</small>}
              </span>
            </div>
          ))}
        </div>
      )}

      {match.avvisi.length > 0 && (
        <p className="field-note" style={{ marginTop: 8 }}>
          {match.avvisi.join(". ")}. Il punteggio è meno preciso.
        </p>
      )}

      <p className="field-note" style={{ marginTop: 8 }}>
        È una compatibilità calcolata sui tuoi criteri, non una previsione di
        essere accettato dal proprietario.
      </p>
    </div>
  );
}
