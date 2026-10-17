"use client";

import { importoDaTesto, posizioneBarra } from "@/lib/importo";

/**
 * Un importo mensile con la barra E la possibilità di scrivere il numero a mano. Le due cose restano allineate: spostando la barra cambia la cifra,
 * scrivendo la cifra si sposta la barra (che si ferma in fondo se la cifra è più alta). Il valore è sempre un intero tra 0 e il massimo; di partenza 0.
 */
export function CampoImporto({
  valore,
  onChange,
  massimoBarra,
  nome,
}: {
  valore: number;
  onChange: (nuovo: number) => void;
  /** dove finisce la barra */
  massimoBarra: number;
  /** come si chiama il campo, per chi usa un lettore di schermo */
  nome: string;
}) {
  return (
    <div className="campo-importo">
      <input
        type="range"
        min={0}
        max={massimoBarra}
        step={50}
        value={posizioneBarra(valore, massimoBarra)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label={`${nome}: barra`}
      />
      <label className="campo-importo-cifra">
        <span className="campo-importo-euro" aria-hidden="true">
          €
        </span>
        {/* un campo di TESTO con la tastiera dei numeri, non un campo numerico: con il valore di partenza 0 un campo numerico lascia lo zero davanti
            («02500» scrivendo 2500) perché non riscrive una cifra numericamente uguale; il campo di testo mostra sempre la cifra pulita */}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={String(valore)}
          onChange={(e) => onChange(importoDaTesto(e.target.value.replace(/[^\d.,]/g, "")))}
          aria-label={`${nome}: scrivi la cifra`}
        />
        <span className="campo-importo-mese">al mese</span>
      </label>
    </div>
  );
}
