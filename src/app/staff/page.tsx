import Link from "next/link";
import { richiediStaff } from "@/lib/staff";

type Riga = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  owner_id: string;
  verifica_inviata_at: string | null;
};

function quandoFa(iso: string | null): string {
  if (!iso) return "";
  const ore = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (ore < 1) return "meno di un'ora fa";
  if (ore < 48) return `${ore} ore fa`;
  return `${Math.floor(ore / 24)} giorni fa`;
}

export default async function StaffPage() {
  const supabase = await richiediStaff();

  const { data } = await supabase
    .from("listings")
    .select("id, titolo, zona, prezzo, owner_id, verifica_inviata_at")
    .eq("verifica_stato", "in_verifica")
    .order("verifica_inviata_at", { ascending: true });
  const immobili = (data ?? []) as Riga[];

  // I nomi dei proprietari, con la lettura che la sicurezza concede allo staff
  const ids = [...new Set(immobili.map((i) => i.owner_id))];
  const { data: profili } =
    ids.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", ids)
      : { data: [] };
  const nomi = new Map(
    (profili ?? []).map((p) => [p.id as string, [p.nome, p.cognome].filter(Boolean).join(" ")])
  );

  return (
    <>
      <h1 className="screen-title">Immobili da verificare</h1>
      <p className="screen-sub">
        {immobili.length === 0
          ? "Nessun immobile in attesa."
          : `${immobili.length} in attesa, i più vecchi per primi.`}
      </p>

      <div className="staff-lista">
        {immobili.map((i) => (
          <Link key={i.id} href={`/staff/${i.id}`} className="match-card">
            <div className="mc-avatar">{i.titolo.slice(0, 2).toUpperCase()}</div>
            <div className="mc-body">
              <div className="mc-zona">{i.zona}</div>
              <div className="mc-title">{i.titolo}</div>
              <div className="mc-meta">
                {nomi.get(i.owner_id) || "Proprietario senza nome"} · inviato{" "}
                {quandoFa(i.verifica_inviata_at)}
              </div>
            </div>
            <div className="mc-pct is-wait">Da controllare</div>
          </Link>
        ))}
      </div>
    </>
  );
}
