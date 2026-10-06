import Link from "next/link";
import { notFound } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import { EsitoForm } from "./EsitoForm";

type Documento = { id: string; tipo: string; percorso: string; nome_file: string; listing_id: string | null };

export default async function StaffDettaglioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await richiediStaff();
  const { id } = await params;
  // l'id arriva dall'indirizzo: si controlla prima di usarlo in una query
  if (!èUuid(id)) notFound();

  const { data: immobile } = await supabase
    .from("listings")
    .select("id, titolo, descrizione, zona, prezzo, locali, mq, owner_id, verifica_stato, verifica_inviata_at, verifica_esito_note")
    .eq("id", id)
    .single();
  if (!immobile) notFound();

  const [{ data: profilo }, { data: proprieta }, { data: identita }] = await Promise.all([
    supabase.from("profiles").select("nome, cognome").eq("id", immobile.owner_id).single(),
    supabase
      .from("documenti_verifica")
      .select("id, tipo, percorso, nome_file, listing_id")
      .eq("listing_id", id)
      .eq("tipo", "proprieta"),
    supabase
      .from("documenti_verifica")
      .select("id, tipo, percorso, nome_file, listing_id")
      .eq("owner_id", immobile.owner_id)
      .eq("tipo", "identita"),
  ]);

  // Indirizzi temporanei di 5 minuti, generati con la sessione dello staff:
  // i documenti non hanno mai un indirizzo pubblico.
  async function conLink(docs: Documento[] | null) {
    return Promise.all(
      (docs ?? []).map(async (d) => {
        const { data } = await supabase.storage
          .from("documenti-verifica")
          .createSignedUrl(d.percorso, 300);
        return { ...d, url: data?.signedUrl ?? null };
      })
    );
  }
  const [docProprieta, docIdentita] = await Promise.all([
    conLink(proprieta as Documento[] | null),
    conLink(identita as Documento[] | null),
  ]);

  const nome = [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ") || "Senza nome";
  const decidibile = immobile.verifica_stato === "in_verifica";

  return (
    <>
      <Link href="/staff" className="redo-link">
        ← Torna all&apos;elenco
      </Link>
      <h1 className="screen-title" style={{ marginTop: 14 }}>
        {immobile.titolo}
      </h1>
      <p className="screen-sub">
        {immobile.zona} · €{Number(immobile.prezzo).toLocaleString("it-IT")}/mese
        {immobile.locali ? ` · ${immobile.locali} locali` : ""}
        {immobile.mq ? ` · ${immobile.mq} m²` : ""}
      </p>

      <div className="feat-row">
        <span className="k">Proprietario</span>
        <span className="v">{nome}</span>
      </div>
      <div className="feat-row">
        <span className="k">Stato</span>
        <span className="v">{immobile.verifica_stato.replace("_", " ")}</span>
      </div>

      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Documento d&apos;identità del proprietario</span>
      </div>
      <ElencoDocumenti documenti={docIdentita} vuoto="Non ha caricato il documento d'identità." />

      <div className="pref-label" style={{ marginTop: 24 }}>
        <span>Prova di proprietà dell&apos;immobile</span>
      </div>
      <ElencoDocumenti documenti={docProprieta} vuoto="Non ha caricato nessuna prova di proprietà." />

      <p className="field-note" style={{ marginTop: 14 }}>
        Controlla che il nome sulla prova di proprietà coincida con quello sul
        documento d&apos;identità. I link durano 5 minuti: ricarica la pagina
        se scadono.
      </p>

      <div style={{ marginTop: 26 }}>
        {decidibile ? (
          <EsitoForm id={id} />
        ) : (
          <div className="note-box">
            Questo immobile non è in attesa di verifica (stato:{" "}
            {immobile.verifica_stato.replace("_", " ")}).
          </div>
        )}
      </div>
    </>
  );
}

function ElencoDocumenti({
  documenti,
  vuoto,
}: {
  documenti: { id: string; nome_file: string; url: string | null }[];
  vuoto: string;
}) {
  if (documenti.length === 0) return <p className="note-error">{vuoto}</p>;
  return (
    <div className="staff-documenti">
      {documenti.map((d) =>
        d.url ? (
          <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="staff-doc">
            {d.nome_file}
          </a>
        ) : (
          <span key={d.id} className="staff-doc errore">
            {d.nome_file} (non apribile)
          </span>
        )
      )}
    </div>
  );
}
