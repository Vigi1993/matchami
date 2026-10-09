import Link from "next/link";
import { richiediStaff } from "@/lib/staff";
import { InvioManuale } from "./InvioManuale";

type Copia = { id: string; user_id: string; oggetto: string; testo: string; created_at: string };
type RigaRegistro = { id: string; fornitore: string; esito: string; n_notifiche: number; errore: string | null; created_at: string };

const quando = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function StaffEmailPage() {
  const supabase = await richiediStaff();

  // Le funzioni controllano da sé che chi chiama sia dello staff.
  const [{ data: copieData }, { data: registroData }] = await Promise.all([
    supabase.rpc("email_di_prova_staff"),
    supabase.rpc("registro_email_staff"),
  ]);
  const copie = (copieData ?? []) as Copia[];
  const registro = (registroData ?? []) as RigaRegistro[];

  return (
    <>
      <p>
        <Link href="/staff" className="redo-link">
          ← Staff
        </Link>
      </p>
      <h1 className="screen-title">Email per le notifiche</h1>
      <p className="screen-sub">
        Finché il fornitore è provvisorio le email <b>non partono</b>: qui si leggono le copie di prova (solo testo, per 7 giorni).
        Con uno scheduler l&apos;invio parte da solo; qui puoi farlo partire a mano.
      </p>

      <InvioManuale />

      <div className="pref-label">
        <span>Copie di prova — {copie.length}</span>
      </div>
      {copie.length === 0 ? (
        <p className="field-note">Nessuna copia. Si creano quando un giro di invio trova notifiche non lette da mandare.</p>
      ) : (
        <ul className="staff-lista">
          {copie.map((c) => (
            <li key={c.id}>
              <details>
                <summary>
                  {quando(c.created_at)} · {c.oggetto} · <span className="field-note">persona {c.user_id.slice(0, 8)}</span>
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "8px 0 0" }}>{c.testo}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Registro degli invii — {registro.length}</span>
      </div>
      <p className="field-note">Solo data, esito e quante notifiche: né il contenuto né gli indirizzi. Si conserva 90 giorni.</p>
      {registro.length > 0 && (
        <ul className="staff-lista">
          {registro.map((r) => (
            <li key={r.id}>
              {quando(r.created_at)} · {r.fornitore} · <b>{r.esito === "inviata" ? "inviata" : "fallita"}</b> · {r.n_notifiche}{" "}
              {r.n_notifiche === 1 ? "notifica" : "notifiche"}
              {r.errore ? ` · ${r.errore}` : ""}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
