import Link from "next/link";
import { TestoInformativa } from "@/components/TestoInformativa";

export const metadata = { title: "Informativa sulla privacy · MatchAmI" };

/** Pubblica: si legge anche senza account, per esempio prima di registrarsi. */
export default function InformativaPage() {
  return (
    <main className="informativa-pagina">
      <div className="informativa-colonna">
        <div className="login-brand" style={{ color: "var(--ink)", marginBottom: 18 }}>
          Match<b>AmI</b>
        </div>
        <TestoInformativa />
        <p style={{ marginTop: 28 }}>
          <Link href="/" className="redo-link">
            ← Torna a MatchAmI
          </Link>
        </p>
      </div>
    </main>
  );
}
