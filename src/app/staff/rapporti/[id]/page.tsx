import Link from "next/link";
import { notFound } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import { EsitoRapportoForm } from "./EsitoRapportoForm";

function periodoTesto(da: string, a: string | null): string {
  const f = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return a ? `dal ${f(da)} al ${f(a)}` : `dal ${f(da)}, ancora in corso`;
}

export default async function StaffRapportoPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await richiediStaff();
  const { id } = await params;
  // l'id arriva dall'indirizzo: si controlla prima di usarlo in una query
  if (!èUuid(id)) notFound();

  const { data: rapporto } = await supabase
    .from("rapporti_locazione")
    .select("id, owner_id, tenant_id, creato_da, listing_id, periodo_da, periodo_a, documento_path, stato, esito_note, listings(titolo, zona)")
    .eq("id", id)
    .single();
  if (!rapporto) notFound();

  const { data: persone } = await supabase
    .from("profiles")
    .select("id, nome, cognome")
    .in("id", [rapporto.owner_id, rapporto.tenant_id]);
  const nome = (uid: string) =>
    (persone ?? []).filter((p) => p.id === uid).map((p) => [p.nome, p.cognome].filter(Boolean).join(" "))[0] ||
    "Senza nome";

  // Il contratto: un indirizzo temporaneo di 5 minuti, mai pubblico.
  const { data: firmato } = rapporto.documento_path
    ? await supabase.storage.from("documenti-verifica").createSignedUrl(rapporto.documento_path, 300)
    : { data: null };

  // Per contesto: il proprietario ha già un immobile verificato?
  const { data: proprietarioVerificato } = await supabase.rpc("proprietario_verificato", {
    p_owner: rapporto.owner_id,
  });

  const l = (Array.isArray(rapporto.listings) ? rapporto.listings[0] : rapporto.listings) as
    | { titolo: string; zona: string }
    | null;
  const decidibile = rapporto.stato === "da_verificare";
  const dichiaratoDa = rapporto.creato_da === rapporto.owner_id ? "il proprietario" : "l'inquilino";

  return (
    <>
      <Link href="/staff" className="redo-link">
        ← Torna all&apos;elenco
      </Link>
      <h1 className="screen-title" style={{ marginTop: 14 }}>
        {l?.titolo ?? "Affitto"}
      </h1>
      <p className="screen-sub">{periodoTesto(rapporto.periodo_da, rapporto.periodo_a)}</p>

      <div className="feat-row">
        <span className="k">Proprietario</span>
        <span className="v">
          {nome(rapporto.owner_id)} · {proprietarioVerificato === true ? "verificato" : "non ancora verificato"}
        </span>
      </div>
      <div className="feat-row">
        <span className="k">Inquilino</span>
        <span className="v">{nome(rapporto.tenant_id)}</span>
      </div>
      <div className="feat-row">
        <span className="k">Immobile</span>
        <span className="v">{l ? `${l.titolo} (${l.zona})` : "—"}</span>
      </div>
      <div className="feat-row">
        <span className="k">Dichiarato da</span>
        <span className="v">{dichiaratoDa}, poi confermato dall&apos;altra persona</span>
      </div>
      <div className="feat-row">
        <span className="k">Stato</span>
        <span className="v">{rapporto.stato.replace("_", " ")}</span>
      </div>

      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Il contratto</span>
      </div>
      {firmato?.signedUrl ? (
        <div className="staff-documenti">
          <a href={firmato.signedUrl} target="_blank" rel="noopener noreferrer" className="staff-doc">
            Apri il contratto
          </a>
        </div>
      ) : (
        <p className="note-error">Il contratto non si apre. Ricarica la pagina.</p>
      )}

      <p className="field-note" style={{ marginTop: 14 }}>
        Controlla che nel contratto compaiano il proprietario, l&apos;inquilino,
        l&apos;immobile e il periodo indicati qui sopra. Il link dura 5 minuti.
      </p>

      <div style={{ marginTop: 26 }}>
        {decidibile ? (
          <EsitoRapportoForm id={id} />
        ) : (
          <div className="note-box">
            Questo affitto non è in attesa di verifica (stato: {rapporto.stato.replace("_", " ")}).
          </div>
        )}
      </div>
    </>
  );
}
