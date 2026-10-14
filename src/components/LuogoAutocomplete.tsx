"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cercaLuoghi, etichettaLuogo, mappaLuoghi, MAX_LUOGHI_SCELTI, semplificaScelte, type Luogo, type LivelloLuogo } from "@/lib/luoghi";

/**
 * Si scrive il nome di una provincia, di una città o di un quartiere e compaiono i suggerimenti; scegliendo una città
 * si scelgono anche tutti i suoi quartieri. I luoghi scelti compaiono come etichette che si tolgono con un tocco.
 * Una casella con suggerimenti completa: frecce per scorrere, Invio per scegliere, Esc per chiudere.
 */
export function LuogoAutocomplete({
  luoghi,
  scelti,
  onChange,
  singolo = false,
  livelli,
  etichetta = "Dove cerchi: provincia, città o quartiere",
  segnaposto = "Scrivi una città o un quartiere",
}: {
  luoghi: Luogo[];
  scelti: string[];
  onChange: (ids: string[]) => void;
  /** un solo luogo: sceglierne uno sostituisce il precedente (per l'annuncio: l'immobile sta in un posto solo) */
  singolo?: boolean;
  /** quali livelli si possono scegliere (per l'annuncio: quartiere o città, non una provincia) */
  livelli?: readonly LivelloLuogo[];
  etichetta?: string;
  segnaposto?: string;
}) {
  const idLista = useId();
  const contenitore = useRef<HTMLDivElement>(null);
  const [testo, setTesto] = useState("");
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const mappa = useMemo(() => mappaLuoghi(luoghi), [luoghi]);
  const suggerimenti = useMemo(() => cercaLuoghi(testo, luoghi, { esclusi: scelti, livelli }), [testo, luoghi, scelti, livelli]);
  const pieno = !singolo && scelti.length >= MAX_LUOGHI_SCELTI;

  function scegli(id: string) {
    onChange(singolo ? [id] : semplificaScelte([...scelti, id], mappa));
    setTesto("");
    setAttivo(0);
    setAperto(false);
  }

  function tasto(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggerimenti.length > 0) {
      e.preventDefault();
      setAperto(true);
      setAttivo((a) => (a + 1) % suggerimenti.length);
    } else if (e.key === "ArrowUp" && suggerimenti.length > 0) {
      e.preventDefault();
      setAttivo((a) => (a - 1 + suggerimenti.length) % suggerimenti.length);
    } else if (e.key === "Enter") {
      // Invio sceglie il suggerimento e basta: non deve inviare il modulo
      e.preventDefault();
      if (aperto && suggerimenti[attivo]) scegli(suggerimenti[attivo].luogo.id);
    } else if (e.key === "Escape") {
      if (aperto) {
        e.stopPropagation();
        setAperto(false);
      }
    }
  }

  return (
    <div
      ref={contenitore}
      className="luogo-ac"
      onBlur={(e) => {
        if (!contenitore.current?.contains(e.relatedTarget as Node | null)) setAperto(false);
      }}
    >
      {scelti.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {scelti.map((id) => {
            const l = mappa.get(id);
            if (!l) return null;
            const etichetta = etichettaLuogo(l, mappa);
            return (
              <button key={id} type="button" className="chip on" aria-label={`Togli ${etichetta}`} onClick={() => onChange(scelti.filter((x) => x !== id))}>
                {etichetta} ×
              </button>
            );
          })}
        </div>
      )}

      <input
        type="text"
        role="combobox"
        aria-label={etichetta}
        aria-expanded={aperto && suggerimenti.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={aperto && suggerimenti[attivo] ? `${idLista}-${attivo}` : undefined}
        autoComplete="off"
        disabled={pieno}
        placeholder={pieno ? `Hai scelto ${MAX_LUOGHI_SCELTI} luoghi` : singolo && scelti.length > 0 ? "Cambia zona" : segnaposto}
        value={testo}
        maxLength={60}
        className="luogo-ac-input"
        onChange={(e) => {
          setTesto(e.target.value);
          setAttivo(0);
          setAperto(true);
        }}
        onFocus={() => testo && setAperto(true)}
        onKeyDown={tasto}
      />

      {aperto && suggerimenti.length > 0 && (
        <ul id={idLista} role="listbox" aria-label="Suggerimenti" className="luogo-ac-lista" onMouseDown={(e) => e.preventDefault()}>
          {suggerimenti.map((s, i) => (
            <li key={s.luogo.id} id={`${idLista}-${i}`} role="option" aria-selected={i === attivo} className={i === attivo ? "attivo" : ""} onClick={() => scegli(s.luogo.id)} onMouseEnter={() => setAttivo(i)}>
              <b>{s.luogo.livello === "provincia" ? `Provincia di ${s.luogo.nome}` : s.luogo.nome}</b>
              <span>{s.percorso}</span>
            </li>
          ))}
        </ul>
      )}
      {aperto && testo.trim() !== "" && suggerimenti.length === 0 && (
        <p className="field-note" style={{ margin: "6px 0 0" }}>
          Nessun risultato. Per ora ci sono Milano e Bergamo.
        </p>
      )}
    </div>
  );
}
