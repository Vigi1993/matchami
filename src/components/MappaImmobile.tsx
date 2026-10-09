import type { VistaMappa } from "@/lib/mappe/tipi";

/**
 * La mappa di un immobile, nel modo che il fornitore ha scelto (`vista`): un
 * riquadro incorporato, un'immagine, o — finché il fornitore è provvisorio — un
 * disegno segnaposto che dice di esserlo. Non sceglie niente da sola.
 */
export function MappaImmobile({ vista }: { vista: VistaMappa }) {
  if (vista.tipo === "incorporata") {
    return (
      <iframe
        className="mappa-riquadro"
        title={vista.titolo}
        src={vista.url}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }
  if (vista.tipo === "immagine") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="mappa-riquadro" src={vista.url} alt={vista.alt} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return (
    <div className="mappa-provvisoria" role="img" aria-label={vista.etichetta}>
      <svg viewBox="0 0 200 110" aria-hidden>
        <rect width="200" height="110" rx="10" />
        <path d="M0 70 Q50 55 100 70 T200 60M30 0 L55 110M120 0 L105 110M0 30 L200 40" />
        <circle cx="100" cy="52" r="9" />
        <circle cx="100" cy="52" r="3.5" />
      </svg>
      <span>{vista.etichetta}</span>
    </div>
  );
}
