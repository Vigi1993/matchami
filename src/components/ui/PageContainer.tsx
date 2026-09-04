/**
 * Contenitore standard di ogni schermata. Su smartphone occupa la
 * larghezza disponibile con margini stretti (come oggi). Su desktop
 * (a partire da md), invece di restare largo quanto un telefono,
 * prende una larghezza confortevole per la lettura e più margine.
 *
 * Cambiare l'aspetto di TUTTE le schermate (padding, larghezza massima)
 * si fa modificando solo questo file.
 */
export function PageContainer({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`w-full mx-auto px-5 pt-6 pb-8 md:px-10 md:pt-10 md:pb-12 ${
        wide ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      {children}
    </div>
  );
}
