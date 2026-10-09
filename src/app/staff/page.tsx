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

  // Gli affitti già confermati dalle due parti, in attesa del controllo del contratto
  const { data: rapportiData } = await supabase
    .from("rapporti_locazione")
    .select("id, owner_id, tenant_id, periodo_da, periodo_a, created_at, listings(titolo, zona)")
    .eq("stato", "da_verificare")
    .order("created_at", { ascending: true });
  const rapporti = (rapportiData ?? []) as unknown as {
    id: string; owner_id: string; tenant_id: string; periodo_da: string; periodo_a: string | null;
    created_at: string; listings: { titolo: string; zona: string } | { titolo: string; zona: string }[] | null;
  }[];

  const idPersone = [...new Set(rapporti.flatMap((r) => [r.owner_id, r.tenant_id]))];
  const { data: persone } =
    idPersone.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", idPersone)
      : { data: [] };
  const nomiPersone = new Map(
    (persone ?? []).map((p) => [p.id as string, [p.nome, p.cognome].filter(Boolean).join(" ") || "Senza nome"])
  );

  // Gli inquilini che hanno inviato i documenti del reddito. Lo staff non
  // legge i profili: la funzione del database gli dà solo nome e data.
  const { data: inquiliniData } = await supabase.rpc("inquilini_da_verificare");
  const inquilini = (inquiliniData ?? []) as {
    tenant_id: string;
    nome: string | null;
    cognome: string | null;
    inviata_at: string | null;
  }[];

  return (
    <>
      <p>
        <Link href="/staff/email" className="redo-link">
          Email di prova →
        </Link>
      </p>
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

      <h1 className="screen-title" style={{ marginTop: 36 }}>
        Affitti da verificare
      </h1>
      <p className="screen-sub">
        {rapporti.length === 0
          ? "Nessun affitto in attesa."
          : `${rapporti.length} già confermati da entrambe le persone, i più vecchi per primi.`}
      </p>
      <div className="staff-lista">
        {rapporti.map((r) => {
          const l = Array.isArray(r.listings) ? r.listings[0] : r.listings;
          return (
            <Link key={r.id} href={`/staff/rapporti/${r.id}`} className="match-card">
              <div className="mc-avatar">AF</div>
              <div className="mc-body">
                <div className="mc-zona">{l?.zona ?? "Immobile"}</div>
                <div className="mc-title">{l?.titolo ?? "Affitto"}</div>
                <div className="mc-meta">
                  {nomiPersone.get(r.owner_id)} (proprietario) · {nomiPersone.get(r.tenant_id)} (inquilino)
                </div>
              </div>
              <div className="mc-pct is-wait">Da controllare</div>
            </Link>
          );
        })}
      </div>
    
      <h1 className="screen-title" style={{ marginTop: 36 }}>
        Redditi da verificare
      </h1>
      <p className="screen-sub">
        {inquilini.length === 0
          ? "Nessun inquilino in attesa."
          : `${inquilini.length} in attesa, i più vecchi per primi.`}
      </p>
      <div className="staff-lista">
        {inquilini.map((q) => {
          const nome = [q.nome, q.cognome].filter(Boolean).join(" ") || "Senza nome";
          return (
            <Link key={q.tenant_id} href={`/staff/inquilini/${q.tenant_id}`} className="match-card">
              <div className="mc-avatar">{nome.slice(0, 2).toUpperCase()}</div>
              <div className="mc-body">
                <div className="mc-zona">Inquilino</div>
                <div className="mc-title">{nome}</div>
                <div className="mc-meta">inviato {quandoFa(q.inviata_at)}</div>
              </div>
              <div className="mc-pct is-wait">Da controllare</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
