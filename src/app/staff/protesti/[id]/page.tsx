import Link from "next/link";
import { notFound } from "next/navigation";
import { richiediStaff, èUuid } from "@/lib/staff";
import { ETICHETTE_DOCUMENTO_PROTESTI, TIPI_DOCUMENTO_PROTESTI } from "@/lib/protesti";
import type { DocumentoInquilino } from "@/lib/verifica-inquilino";
import { EsitoProtestiForm } from "./EsitoProtestiForm";

/**
 * Lo staff controlla il certificato dei protesti di un inquilino e decide: nessun protesto, ci sono protesti, oppure respinge il documento.
 * Lo staff NON legge il profilo intero: la funzione del database gli restituisce solo ciò che serve (nome e risposta data).
 */
export default async function StaffProtestiPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await richiediStaff();
  const { id } = await params;
  // l'id arriva dall'indirizzo: si controlla prima di usarlo in una query
  if (!èUuid(id)) notFound();

  const { data } = await supabase.rpc("dati_per_verifica_protesti", { p_tenant: id });
  const dati = (data ?? [])[0] as { nome: string | null; cognome: string | null; protestato: boolean | null; protesti_verifica_stato: string } | undefined;
  if (!dati) notFound();

  const nome = [dati.nome, dati.cognome].filter(Boolean).join(" ") || "Senza nome";

  const { data: documentiData } = await supabase.from("documenti_inquilino").select("id, tipo, percorso, nome_file").eq("tenant_id", id).in("tipo", [...TIPI_DOCUMENTO_PROTESTI]).order("created_at", { ascending: true });
  const documenti = (documentiData ?? []) as DocumentoInquilino[];

  // I documenti: indirizzi temporanei di 5 minuti, mai pubblici.
  const firmati = await Promise.all(
    documenti.map(async (d) => {
      const { data: f } = await supabase.storage.from("documenti-verifica").createSignedUrl(d.percorso, 300);
      return { ...d, url: f?.signedUrl ?? null };
    })
  );

  const decidibile = dati.protesti_verifica_stato === "in_verifica";
  const dichiarato = dati.protestato === null ? "non ha risposto" : dati.protestato ? "ha dichiarato di avere protesti" : "ha dichiarato di NON avere protesti";

  return (
    <>
      <Link href="/staff" className="redo-link">
        ← Torna all&apos;elenco
      </Link>
      <h1 className="screen-title" style={{ marginTop: 14 }}>
        {nome}
      </h1>
      <p className="screen-sub">Verifica dei protesti</p>

      <div className="pref-label" style={{ marginTop: 6 }}>
        <span>Ciò che ha dichiarato</span>
      </div>
      <div className="feat-row">
        <span className="k">Nome</span>
        <span className="v">{nome}</span>
      </div>
      <div className="feat-row">
        <span className="k">Protesti</span>
        <span className="v">{dichiarato}</span>
      </div>

      {TIPI_DOCUMENTO_PROTESTI.map((tipo) => {
        const miei = firmati.filter((d) => d.tipo === tipo);
        return (
          <div key={tipo}>
            <div className="pref-label" style={{ marginTop: 24 }}>
              <span>{ETICHETTE_DOCUMENTO_PROTESTI[tipo]}</span>
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
        Controlla che il nome sul documento d&apos;identità e sul certificato sia «{nome}» e che il certificato sia recente. Poi scegli cosa risulta: il tuo esito vale più di ciò che
        la persona ha dichiarato. I link durano 5 minuti.
      </p>

      <div style={{ marginTop: 26 }}>
        {decidibile ? (
          <EsitoProtestiForm id={id} />
        ) : (
          <div className="note-box">Questa persona non ha una verifica dei protesti in attesa (stato: {dati.protesti_verifica_stato.replace("_", " ")}).</div>
        )}
      </div>
    </>
  );
}
