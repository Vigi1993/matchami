import Link from "next/link";
import { notFound } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import {
  ETICHETTE_DOCUMENTO,
  TIPI_DOCUMENTO_INQUILINO,
  type DocumentoInquilino,
} from "@/lib/verifica-inquilino";
import { EsitoInquilinoForm } from "./EsitoInquilinoForm";

const euro = (n: number | null) =>
  n === null || n === undefined ? "non indicato" : `${n.toLocaleString("it-IT")} € al mese`;

export default async function StaffInquilinoPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await richiediStaff();
  const { id } = await params;
  // l'id arriva dall'indirizzo: si controlla prima di usarlo in una query
  if (!èUuid(id)) notFound();

  // Lo staff NON legge il profilo intero: la funzione gli restituisce solo
  // ciò che serve a confrontare la dichiarazione con i documenti.
  const { data } = await supabase.rpc("dati_per_verifica_inquilino", { p_tenant: id });
  const dati = (data ?? [])[0] as
    | {
        nome: string | null;
        cognome: string | null;
        professione: string | null;
        reddito_mensile: number | null;
        reddito_nucleo: number | null;
        verifica_stato: string;
      }
    | undefined;
  if (!dati) notFound();

  const nome = [dati.nome, dati.cognome].filter(Boolean).join(" ") || "Senza nome";

  const { data: documentiData } = await supabase
    .from("documenti_inquilino")
    .select("id, tipo, percorso, nome_file")
    .eq("tenant_id", id)
    .order("created_at", { ascending: true });
  const documenti = (documentiData ?? []) as DocumentoInquilino[];

  // I documenti: indirizzi temporanei di 5 minuti, mai pubblici.
  const firmati = await Promise.all(
    documenti.map(async (d) => {
      const { data: f } = await supabase.storage.from("documenti-verifica").createSignedUrl(d.percorso, 300);
      return { ...d, url: f?.signedUrl ?? null };
    })
  );

  const decidibile = dati.verifica_stato === "in_verifica";

  return (
    <>
      <Link href="/staff" className="redo-link">
        ← Torna all&apos;elenco
      </Link>
      <h1 className="screen-title" style={{ marginTop: 14 }}>
        {nome}
      </h1>
      <p className="screen-sub">Verifica del reddito</p>

      <div className="pref-label" style={{ marginTop: 6 }}>
        <span>Ciò che ha dichiarato</span>
      </div>
      <div className="feat-row">
        <span className="k">Nome</span>
        <span className="v">{nome}</span>
      </div>
      <div className="feat-row">
        <span className="k">Lavoro</span>
        <span className="v">{dati.professione || "non indicato"}</span>
      </div>
      <div className="feat-row">
        <span className="k">Reddito suo</span>
        <span className="v">{euro(dati.reddito_mensile)}</span>
      </div>
      <div className="feat-row">
        <span className="k">Reddito del nucleo</span>
        <span className="v">{euro(dati.reddito_nucleo)}</span>
      </div>

      {TIPI_DOCUMENTO_INQUILINO.map((tipo) => {
        const miei = firmati.filter((d) => d.tipo === tipo);
        return (
          <div key={tipo}>
            <div className="pref-label" style={{ marginTop: 24 }}>
              <span>{ETICHETTE_DOCUMENTO[tipo]}</span>
            </div>
            {miei.length === 0 ? (
              <p className="note-error">Nessun file caricato.</p>
            ) : (
              <div className="staff-documenti">
                {miei.map((d) =>
                  d.url ? (
                    <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="staff-doc">
                      {d.nome_file}
                    </a>
                  ) : (
                    <p key={d.id} className="note-error">
                      {d.nome_file}: non si apre. Ricarica la pagina.
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="field-note" style={{ marginTop: 14 }}>
        Controlla che il nome sul documento d&apos;identità sia «{nome}» e che la prova del reddito
        sia coerente con quanto dichiarato qui sopra. I link durano 5 minuti.
      </p>

      <div style={{ marginTop: 26 }}>
        {decidibile ? (
          <EsitoInquilinoForm id={id} />
        ) : (
          <div className="note-box">
            Questa persona non ha una verifica in attesa (stato: {dati.verifica_stato.replace("_", " ")}).
          </div>
        )}
      </div>
    </>
  );
}
