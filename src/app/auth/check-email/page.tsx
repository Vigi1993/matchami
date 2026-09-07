export default function CheckEmailPage() {
  return (
    <main className="login-view">
      <div
        className="login-bg"
        style={{ backgroundImage: "url(/login-bg.jpg)" }}
      />
      <div className="login-scrim" />
      <div className="login-content">
        {/* margini automatici sopra e sotto: il blocco resta centrato */}
        <div style={{ marginTop: "auto", marginBottom: "auto", textAlign: "center" }}>
          <div className="login-brand">
            Match<b>AmI</b>
          </div>
          <p className="login-tag" style={{ maxWidth: "none", margin: 0 }}>
            Ti abbiamo mandato un&apos;email di conferma. Apri il link che trovi
            dentro per attivare il tuo account e iniziare.
          </p>
        </div>
      </div>
    </main>
  );
}
