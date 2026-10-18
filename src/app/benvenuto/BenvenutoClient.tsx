"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/app/login/actions";
import { completaBenvenuto, type BenvenutoState } from "./actions";
import { creaImmobile } from "@/app/(app)/immobili/actions";
import { ImmobileForm } from "@/app/(app)/immobili/ImmobiliClient";
import { DatiForm, type SezioneDati } from "@/components/DatiForm";
import { RicercaSheet } from "@/components/RicercaSheet";
import { CaricaIdentita } from "@/components/CaricaIdentita";
import { IntroBenvenuto } from "@/components/IntroBenvenuto";
import { VerificaImmobile } from "@/components/VerificaImmobile";
import {
  TESTI_BENVENUTO,
  indirizzoPasso,
  percentualeProgresso,
  puoAndareAvanti,
  puoFinire,
  testoProgresso,
  type Passo,
} from "@/lib/benvenuto";
import type { TenantProfile } from "@/lib/types";
import type { ProfiloRicerca } from "@/lib/match";
import type { Luogo } from "@/lib/luoghi";
import type { ImmobileVerifica } from "@/lib/verifica";
import type { RisultatoQuotazione } from "@/lib/prezzi";

type Comune = {
  nome: string | null;
  /** tutte le schede del ruolo, con lo stato di oggi (calcolato sul server dai dati salvati) */
  passi: Passo[];
  /** la scheda che si vede (da 0) */
  indice: number;
};

export type BenvenutoProps =
  | (Comune & {
      ruolo: "inquilino";
      tenant: TenantProfile;
      ricerca: ProfiloRicerca;
      luoghi: Luogo[];
      verificaPanel: React.ReactNode;
      protestiPanel: React.ReactNode;
    })
  | (Comune & {
      ruolo: "proprietario";
      haIdentita: boolean;
      nomiIdentita: string[];
      immobile: ImmobileVerifica | null;
      quotazioni: Record<string, RisultatoQuotazione>;
      luoghi: Luogo[];
    });

const SEZIONE_DATI: Record<string, SezioneDati> = { persona: "persona", reddito: "reddito", garanzie: "garanzie" };

/**
 * Il percorso di benvenuto: una scheda alla volta, con la barra dei passi. Riusa i moduli che già esistono (dati, ricerca, nuovo immobile, documenti),
 * così non ci sono due versioni da tenere allineate. Le schede obbligatorie non si superano senza aver salvato i dati; le altre si possono saltare.
 */
export function BenvenutoClient(p: BenvenutoProps) {
  const router = useRouter();
  const { passi, indice } = p;
  const passo = passi[indice];
  const ultimo = indice === passi.length - 1;
  const [stato, azioneFine, inCorso] = useActionState<BenvenutoState>(completaBenvenuto, null);

  const vai = (i: number) => router.push(indirizzoPasso(i));
  const avanti = () => vai(indice + 1);

  return (
    <div className="benvenuto">
      {/* due gruppi: da computer il fianco (passi) sta a sinistra e il corpo (scheda) a destra; sul telefono i contenitori non esistono per il disegno (display: contents) */}
      <div className="benvenuto-fianco">
      <header className="benvenuto-testa">
        <div className="benvenuto-marchio">
          Match<b>AmI</b>
        </div>
        <p className="benvenuto-saluto">{TESTI_BENVENUTO.saluto(p.nome)}</p>
        <p className="benvenuto-intro">{p.ruolo === "inquilino" ? TESTI_BENVENUTO.introInquilino : TESTI_BENVENUTO.introProprietario}</p>
      </header>

      <div className="benvenuto-progresso">
        <div
          className="benvenuto-barra"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={passi.length}
          aria-valuenow={indice + 1}
          aria-label={testoProgresso(indice, passi.length)}
        >
          <i style={{ width: `${percentualeProgresso(indice, passi.length)}%` }} />
        </div>
        <div className="benvenuto-passi">
          <span className="benvenuto-conteggio">{testoProgresso(indice, passi.length)}</span>
          <ol className="benvenuto-puntini" aria-label="Le schede">
            {passi.map((s, i) => (
              <li key={s.id} className={`${i === indice ? "attivo" : ""} ${s.completo ? "fatto" : ""}`.trim()} aria-current={i === indice ? "step" : undefined}>
                <span className="solo-lettori">{s.titolo}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      </div>

      <div className="benvenuto-corpo">
      <section className="benvenuto-scheda" aria-labelledby="benvenuto-titolo">
        <h1 id="benvenuto-titolo" className="benvenuto-titolo">
          {passo.titolo}
        </h1>
        <p className="benvenuto-descrizione">{passo.descrizione}</p>
        {passo.id !== "intro" && (
          <p className={`benvenuto-tipo ${passo.obbligatorio ? "obbligatoria" : ""}`.trim()}>
            {passo.obbligatorio ? TESTI_BENVENUTO.obbligatorio : TESTI_BENVENUTO.facoltativo}
          </p>
        )}

        <div className="benvenuto-contenuto">
          {p.ruolo === "inquilino" ? <ContenutoInquilino p={p} passo={passo} avanti={avanti} /> : <ContenutoProprietario p={p} passo={passo} router={router} />}
        </div>
      </section>

      <nav className="benvenuto-azioni" aria-label="Navigazione tra le schede">
        {indice > 0 && (
          <button type="button" className="richieste-secondario" onClick={() => vai(indice - 1)}>
            {TESTI_BENVENUTO.indietro}
          </button>
        )}
        {!ultimo ? (
          <button type="button" className="opp-cta" disabled={!puoAndareAvanti(passo)} onClick={avanti}>
            {passo.azione ?? (passo.completo || passo.obbligatorio ? TESTI_BENVENUTO.avanti : TESTI_BENVENUTO.saltaPerOra)}
          </button>
        ) : (
          <form action={azioneFine}>
            <button type="submit" className="opp-cta" disabled={!puoFinire(passi) || inCorso}>
              {inCorso ? "Un momento..." : TESTI_BENVENUTO.finisci}
            </button>
          </form>
        )}
      </nav>
      {stato?.error && (
        <p className="note-error" role="alert">
          {stato.error}
        </p>
      )}
      </div>

      <form action={logout} className="benvenuto-esci">
        <button type="submit" className="redo-link">
          Esci
        </button>
      </form>
    </div>
  );
}

function ContenutoInquilino({ p, passo, avanti }: { p: Extract<BenvenutoProps, { ruolo: "inquilino" }>; passo: Passo; avanti: () => void }) {
  const router = useRouter();
  const [ricercaAperta, setRicercaAperta] = useState(false);

  if (passo.id === "intro") return <IntroBenvenuto ruolo="inquilino" />;

  if (passo.id === "persona" || passo.id === "reddito" || passo.id === "garanzie") {
    // una scheda del modulo dei dati: salvando si passa alla successiva
    return <DatiForm key={passo.id} tenant={p.tenant} sezione={SEZIONE_DATI[passo.id]} etichettaSalva="Salva e continua" onSalvata={avanti} />;
  }

  if (passo.id === "ricerca") {
    return (
      <>
        {passo.completo ? (
          <p className="benvenuto-fatto" role="status">
            Ricerca impostata: fino a €{p.tenant.budget_max?.toLocaleString("it-IT")} al mese.
          </p>
        ) : (
          <p className="field-note">Indica almeno il budget massimo: è ciò che ti fa vedere le case giuste.</p>
        )}
        <button type="button" className="opp-cta" onClick={() => setRicercaAperta(true)}>
          {passo.completo ? "Modifica la ricerca" : "Imposta la ricerca"}
        </button>
        <RicercaSheet
          open={ricercaAperta}
          onClose={() => setRicercaAperta(false)}
          ricerca={p.ricerca}
          luoghi={p.luoghi}
          onSalvata={() => {
            setRicercaAperta(false);
            router.refresh();
          }}
        />
      </>
    );
  }

  // documenti: identità, prova del reddito, certificato dei protesti (si possono caricare anche dopo)
  return (
    <>
      <div className="benvenuto-sezione">
        <h2 className="benvenuto-sottotitolo">Reddito</h2>
        {p.verificaPanel}
      </div>
      <div className="benvenuto-sezione">
        <h2 className="benvenuto-sottotitolo">Protesti</h2>
        {p.protestiPanel}
      </div>
    </>
  );
}

function ContenutoProprietario({ p, passo, router }: { p: Extract<BenvenutoProps, { ruolo: "proprietario" }>; passo: Passo; router: ReturnType<typeof useRouter> }) {
  if (passo.id === "intro") return <IntroBenvenuto ruolo="proprietario" />;

  if (passo.id === "identita") {
    return <CaricaIdentita nomiCaricati={p.nomiIdentita} />;
  }

  if (passo.id === "casa") {
    if (p.immobile) {
      return (
        <p className="benvenuto-fatto" role="status">
          Hai già aggiunto: <b>{p.immobile.titolo}</b>. Potrai modificarla e aggiungere altre case dalla sezione «Immobili».
        </p>
      );
    }
    return <ImmobileForm action={creaImmobile} quotazioni={p.quotazioni} luoghi={p.luoghi} etichettaSalva="Salva e continua" onSaved={() => router.refresh()} />;
  }

  // prova di proprietà del suo primo immobile
  if (!p.immobile) return <p className="field-note">Prima aggiungi la tua casa.</p>;
  return <VerificaImmobile key={p.immobile.id} immobile={p.immobile} haIdentita={p.haIdentita} conIdentita />;
}
