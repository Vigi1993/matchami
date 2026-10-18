"use client";

import { useId, useState } from "react";
import { FiltriDatabase } from "@/components/database/FiltriDatabase";
import { AvatarPersona } from "@/components/database/AvatarPersona";
import { InfoPossibili } from "@/components/database/InfoPossibili";
import { CLASSE_NUMERINO, CLASSE_PULSANTE_CRITERIO, CLASSE_STATO } from "@/components/database/classi";
import { IconChevronSu, IconLente } from "@/components/icons";
import {
  CRITERI_ORDINE,
  ETICHETTE_STATO_VOCE,
  NOMI_CRITERI,
  NOMI_SCHEDE,
  NOMI_VERSO,
  SCHEDE_ELENCO,
  frasaOrdine,
  invertiVerso,
  miniature,
  numeroFiltriAvanzati,
  scegliCriterio,
  testoImmobili,
  testoNumerino,
  type BoxImmobile,
  type FiltriElenco,
  type Ordine,
  type SchedaElenco,
  type VoceElenco,
} from "@/lib/database-elenco";
import { testoPrezzo } from "@/lib/proprietario/home";
import { LUNGHEZZA_MASSIMA_RICERCA } from "@/lib/ricerca-candidati";

/**
 * La colonna dell'elenco del Database inquilini: in alto la ricerca, l'ordinamento (per affidabilità, match o recensioni, dal più alto o dal più basso)
 * e le schede; sotto gli immobili, ognuno in un BOX che si apre e si chiude e che contiene le sue persone. Accanto al nome di ogni persona c'è il
 * numerino del criterio con cui si ordina. Non decide niente: raccoglie le scelte e le passa a chi la usa (lib/database-elenco fa i conti).
 */
export function ElencoDatabase({
  box,
  ordine,
  onOrdine,
  filtri,
  onFiltri,
  conteggi,
  conPunteggi,
  selezionata,
  onSeleziona,
  chiusi,
  onCommuta,
  onTutti,
  idPossibili,
  persone,
  totalePersone,
}: {
  box: BoxImmobile[];
  ordine: Ordine;
  onOrdine: (o: Ordine) => void;
  filtri: FiltriElenco;
  onFiltri: (f: FiltriElenco) => void;
  /** quante persone ci sono in ogni scheda, dopo ricerca e filtri */
  conteggi: Record<SchedaElenco, number>;
  conPunteggi: boolean;
  /** la persona di cui si vede il dettaglio */
  selezionata: string | null;
  onSeleziona: (chiave: string) => void;
  chiusi: Record<string, boolean>;
  onCommuta: (casaId: string) => void;
  /** chiude (true) o apre (false) tutti gli immobili */
  onTutti: (chiudi: boolean) => void;
  /** l'immobile a cui porta il collegamento «Possibili inquilini» della Home */
  idPossibili: string | null;
  /** quante persone si vedono adesso e quante ce ne sono in tutto (per il riepilogo dei filtri) */
  persone: number;
  totalePersone: number;
}) {
  const base = useId();
  const [filtriAperti, setFiltriAperti] = useState(false);
  const avanzati = numeroFiltriAvanzati(filtri);
  const aperti = box.some((b) => !chiusi[b.gruppo.casa.id]);
  const idFiltri = `${base}-filtri`;

  return (
    <div className="db-elenco">
      {/* ---- ricerca ---- */}
      <div className="db-cerca" role="search">
        <IconLente className="db-cerca-icona" />
        <input
          type="search"
          className="db-cerca-campo"
          placeholder="Cerca per nome, lavoro o annuncio"
          aria-label="Cerca tra i candidati"
          value={filtri.testo}
          maxLength={LUNGHEZZA_MASSIMA_RICERCA}
          autoComplete="off"
          onChange={(e) => onFiltri({ ...filtri, testo: e.target.value })}
        />
      </div>

      {/* ---- ordinamento: tre criteri con tre colori e il verso ---- */}
      <div className="db-ordine" role="group" aria-label="Ordina per">
        {CRITERI_ORDINE.map((c) => {
          const acceso = ordine.criterio === c;
          return (
            <button key={c} type="button" className={`db-crit ${CLASSE_PULSANTE_CRITERIO[c]} ${acceso ? "on" : ""}`} aria-pressed={acceso} onClick={() => onOrdine(scegliCriterio(ordine, c))}>
              <i aria-hidden="true" />
              {NOMI_CRITERI[c]}
            </button>
          );
        })}
      </div>
      <div className="db-ordine-riga">
        <p className="db-ordine-nota" aria-live="polite">
          {frasaOrdine(ordine)} Il numero accanto al nome è questo valore.
        </p>
        <button
            type="button"
            className="db-verso"
            aria-label={`Ordine ${NOMI_VERSO[ordine.verso]}. Tocca per invertirlo`}
            title={`Ordine ${NOMI_VERSO[ordine.verso]}: tocca per invertirlo`}
            onClick={() => onOrdine(invertiVerso(ordine))}
          >
            <IconChevronSu className={`db-verso-freccia ${ordine.verso === "decrescente" ? "giu" : ""}`} />
          </button>
      </div>

      {/* ---- le schede ---- */}
      <div className="db-schede" role="group" aria-label="Mostra">
        {SCHEDE_ELENCO.map((s) => (
          <button key={s} type="button" className={`db-scheda ${filtri.scheda === s ? "on" : ""}`} aria-pressed={filtri.scheda === s} onClick={() => onFiltri({ ...filtri, scheda: s })}>
            {NOMI_SCHEDE[s]} <span className="db-scheda-n">{conteggi[s]}</span>
          </button>
        ))}
      </div>

      {/* ---- strumenti: quanti immobili, filtri, apri/chiudi tutti ---- */}
      <div className="db-strumenti">
        <span className="db-strumenti-n">{testoImmobili(box.length)}</span>
        <button type="button" className="db-link" aria-expanded={filtriAperti} aria-controls={idFiltri} onClick={() => setFiltriAperti(!filtriAperti)}>
          Filtri{avanzati > 0 ? ` (${avanzati})` : ""}
        </button>
        {box.length > 0 && (
          <button type="button" className="db-link" onClick={() => onTutti(aperti)}>
            {aperti ? "Comprimi tutti" : "Espandi tutti"}
          </button>
        )}
      </div>
      {filtriAperti && <FiltriDatabase id={idFiltri} filtri={filtri} onCambia={onFiltri} conPunteggi={conPunteggi} visibili={persone} totale={totalePersone} />}

      {/* ---- gli immobili ---- */}
      <div className="db-lista">
        {box.map((b) => (
          <BoxDelloImmobile
            key={b.gruppo.casa.id}
            b={b}
            ordine={ordine}
            chiuso={chiusi[b.gruppo.casa.id] === true}
            selezionata={selezionata}
            onSeleziona={onSeleziona}
            onCommuta={onCommuta}
            id={b.gruppo.casa.id === idPossibili ? "possibili" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function BoxDelloImmobile({
  b,
  ordine,
  chiuso,
  selezionata,
  onSeleziona,
  onCommuta,
  id,
}: {
  b: BoxImmobile;
  ordine: Ordine;
  chiuso: boolean;
  selezionata: string | null;
  onSeleziona: (chiave: string) => void;
  onCommuta: (casaId: string) => void;
  id?: string;
}) {
  const corpo = useId();
  const casa = b.gruppo.casa;
  const { prime, altre } = miniature(b.voci);
  const zona = casa.zona.replace(", Milano", "");
  return (
    <section id={id} className={`db-box ${chiuso ? "chiuso" : ""}`} aria-label={`Immobile: ${casa.titolo}`}>
      {/* tutta l'intestazione è il pulsante che apre e chiude: la freccia dice in che verso va */}
      <button type="button" className="db-box-testa" aria-expanded={!chiuso} aria-controls={corpo} onClick={() => onCommuta(casa.id)}>
        {casa.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={casa.foto} alt="" className="db-foto" />
        ) : (
          <span className="db-foto db-foto-vuota" aria-hidden="true">
            {casa.titolo.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="db-box-chi">
          <span className="db-zona">{zona}</span>
          <span className="db-titolo">{casa.titolo}</span>
          <span className="db-prezzo">{casa.prezzo ? testoPrezzo(casa.prezzo) : "—"}</span>
          <span className="db-riepilogo">{b.riepilogo}</span>
        </span>
        <span className="db-miniature" aria-hidden="true">
          {prime.map((v) => (
            <span key={v.chiave} className={`db-mini ${v.chiave === selezionata ? "sel" : ""}`}>
              <AvatarPersona scheda={v.scheda} />
            </span>
          ))}
          {altre > 0 && <span className="db-mini db-mini-altre">+{altre}</span>}
        </span>
        <span className="db-conta">
          {b.voci.length}
          <span className="solo-lettori"> {b.voci.length === 1 ? "persona" : "persone"}</span>
        </span>
        <IconChevronSu className="db-freccia" />
      </button>

      {/* `inert`: chiuso, il contenuto non si raggiunge né con la tastiera né con un lettore di schermo */}
      <div id={corpo} className="db-box-corpo" inert={chiuso}>
        <div className="db-box-interno">
          {b.voci.length === 0 ? (
            <p className="db-vuoto">{b.totale === 0 ? "Nessuno si è ancora candidato a questa casa." : "Nessuna persona corrisponde."}</p>
          ) : (
            <ul className="db-righe">
              {b.voci.map((v) => (
                <li key={v.chiave}>
                  <Riga v={v} ordine={ordine} selezionata={v.chiave === selezionata} onSeleziona={onSeleziona} />
                </li>
              ))}
            </ul>
          )}
          {b.gruppo.possibili !== null && <InfoPossibili casa={b.gruppo.possibili} />}
        </div>
      </div>
    </section>
  );
}

function Riga({ v, ordine, selezionata, onSeleziona }: { v: VoceElenco; ordine: Ordine; selezionata: boolean; onSeleziona: (chiave: string) => void }) {
  const numero = testoNumerino(v.scheda, ordine.criterio);
  return (
    <button type="button" className={`db-riga ${selezionata ? "on" : ""}`} aria-current={selezionata ? "true" : undefined} data-chiave={v.chiave} onClick={() => onSeleziona(v.chiave)}>
      <AvatarPersona scheda={v.scheda} />
      <span className="db-riga-chi">
        <span className="db-riga-nome">
          {v.scheda.nome}
          <span className={`db-numerino ${CLASSE_NUMERINO[ordine.criterio]} ${numero === "—" ? "vuoto" : ""}`}>
            <span className="solo-lettori">{NOMI_CRITERI[ordine.criterio]}: </span>
            {numero}
          </span>
        </span>
        {v.scheda.professione && <span className="db-riga-lavoro">{v.scheda.professione}</span>}
      </span>
      <span className={`db-stato ${CLASSE_STATO[v.stato]}`}>
        <b aria-hidden="true" />
        {ETICHETTE_STATO_VOCE[v.stato]}
      </span>
    </button>
  );
}
