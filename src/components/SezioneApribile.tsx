"use client";

import { useState } from "react";
import { IconChevronSu } from "@/components/icons";

/**
 * Un gruppo che si apre e si chiude con un tocco, con il titolo e il numero di persone: LA STESSA intestazione dei gruppi della pagina
 * «I tuoi match» dell'inquilino («Titolo — 3» con la freccia), così le pagine dell'app si assomigliano. Il contenuto resta nella pagina
 * anche da chiuso (nascosto, non smontato), così non si perde ciò che si stava facendo.
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
    <section id={id} className="gruppo-match sezione-db">
      <button type="button" className="gruppo-testa" aria-expanded={stato} aria-controls={corpo} onClick={() => setStato(!stato)}>
        <span>
          {titolo} — {conteggio}
        </span>
        <IconChevronSu className={`gruppo-freccia ${stato ? "" : "chiuso"}`} />
      </button>
      <div id={corpo} className="sezione-corpo" hidden={!stato}>
        {conteggio === 0 && vuoto ? <p className="sezione-vuota">{vuoto}</p> : null}
        {children}
      </div>
    </section>
  );
}
