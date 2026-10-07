/**
 * La cornice scura delle pagine che si aprono da un link, anche senza
 * account: titolo grande e testo sotto, sullo sfondo della pagina di accesso.
 */
export function CorniceScura({
  titolo,
  children,
}: {
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="login-view">
      <div className="login-bg" style={{ backgroundImage: "url(/login-bg.jpg)" }} />
      <div className="login-scrim" />
      <div className="login-content">
        <div className="login-brand">
          Match<b>AmI</b>
        </div>
        <h1 className="login-title">{titolo}</h1>
        <div className="login-tag" style={{ display: "grid", gap: 14 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
