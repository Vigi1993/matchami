"use client";

import { useState } from "react";

/**
 * Una sezione che si apre e si chiude con un tocco, con il titolo e il numero di persone che contiene. Il contenuto resta nella
 * pagina anche da chiusa (nascosto, non smontato), così non si perde ciò che si stava facendo.
 */
export function SezioneApribile({
  id,
  titolo,
  conteggio,
  aperta = true,
  vuoto,
  children,
}: {
  id?: string;
  titolo: string;
  conteggio: number;
  aperta?: boolean;
  /** cosa dire se non c'è nessuno */
  vuoto?: string;
  children: React.ReactNode;
}) {
  const [stato, setStato] = useState(aperta);
  const corpo = `${id ?? titolo.replace(/\s+/g, "-").toLowerCase()}-corpo`;
  return (
    <section id={id} className="sezione-apribile">
      <button type="button" className="sezione-testa" aria-expanded={stato} aria-controls={corpo} onClick={() => setStato(!stato)}>
        <span className="sezione-titolo">{titolo}</span>
        <span className={`sezione-numero ${conteggio > 0 ? "pieno" : ""}`}>{conteggio}</span>
        <span className={`sezione-freccia ${stato ? "su" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>
      <div id={corpo} className="sezione-corpo" hidden={!stato}>
        {conteggio === 0 && vuoto ? <p className="sezione-vuota">{vuoto}</p> : null}
        {children}
      </div>
    </section>
  );
}
