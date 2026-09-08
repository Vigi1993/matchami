/**
 * Contenitore standard di una schermata su fondo chiaro.
 * Riproduce `.matches-wrap` / `.profile-wrap` del prototipo: riempie
 * l'area sopra la tab bar, scorre da solo e ha i margini dell'originale.
 *
 * Cambiare l'aspetto di TUTTE le schermate (padding, sfondo) si fa
 * modificando `.screen-wrap` in globals.css.
 */
export function PageContainer({
  children,
}: {
  children: React.ReactNode;
  /** Mantenuto per compatibilità: il telaio è largo 480px, non ci sono
   *  varianti "wide" come nel layout desktop precedente. */
  wide?: boolean;
}) {
  return (
    <div className="screen-wrap">
      {/* su desktop limita la riga di lettura; su mobile non fa nulla */}
      <div className="screen-inner">{children}</div>
    </div>
  );
}
