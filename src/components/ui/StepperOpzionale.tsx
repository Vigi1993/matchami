/**
 * Un contatore con − e +, che può anche stare su «Qualsiasi» (valore 0). Dal valore minimo, − torna a «Qualsiasi»;
 * da «Qualsiasi», + parte da `avvio`.
 */
export function StepperOpzionale({
  etichetta,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  avvio,
  vuoto = "Qualsiasi",
}: {
  /** per chi usa un lettore di schermo: «Locali minimi» */
  etichetta: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  avvio?: number;
  vuoto?: string;
}) {
  const meno = () => {
    if (value === 0) return;
    const prossimo = value - step;
    onChange(prossimo < min ? 0 : prossimo);
  };
  const piu = () => onChange(value === 0 ? (avvio ?? min) : Math.min(max, value + step));
  return (
    <div className="stepper" role="group" aria-label={etichetta}>
      <button type="button" onClick={meno} disabled={value === 0} aria-label={`${etichetta}: diminuisci`}>
        −
      </button>
      <div className="val" aria-live="polite">
        {value === 0 ? vuoto : `${value}${suffix}`}
      </div>
      <button type="button" onClick={piu} disabled={value >= max} aria-label={`${etichetta}: aumenta`}>
        +
      </button>
    </div>
  );
}
