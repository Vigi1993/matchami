import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import { componiContratto } from "@/lib/contratto";
import { datiDaRiga } from "@/lib/contratto/dati";
import { documentoSemplificato, AVVISO_CARATTERI_SEMPLIFICATI } from "@/lib/contratto/testo-pdf";
import type { DocumentoContratto, RigaContratto } from "@/lib/contratto/tipi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La bozza del contratto, per le due parti. Si compone al momento dai dati dell'affitto e non
 * si salva. Finché il modello è quello di prova lo dice in cima: non ha valore legale e non va firmata.
 */
export default async function ContrattoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("dati_contratto", { p_contratto: id });
  const dati = datiDaRiga((Array.isArray(data) ? data[0] : null) as Partial<RigaContratto> | null);
  // per chi non è una delle due parti la funzione non restituisce niente: la pagina non dice nemmeno che il contratto esiste
  if (!dati) notFound();

  const indietro = dati.ioSono === "locatore" ? "/gestione-affitti" : "/gestione";

  let documento: DocumentoContratto | null = null;
  try {
    documento = componiContratto(dati);
  } catch {
    documento = null;
  }

  return (
    <PageContainer wide>
      <p>
        <Link href={indietro} className="redo-link">
          ← Contratti
        </Link>
      </p>

      {!documento ? (
        <div className="note-box is-no" role="alert">
          Il modello di contratto non è configurato correttamente. Avvisa chi gestisce l&apos;app.
        </div>
      ) : (
        <>
          <h1 className="screen-title">{documento.titolo}</h1>
          {documento.sottotitolo && <p className="screen-sub">{documento.sottotitolo}</p>}

          {documento.avvisi.map((a, i) => (
            <div key={i} className={`note-box${documento.bozza && i === 0 ? " is-no" : ""}`} style={{ marginBottom: 10 }}>
              {i === 0 ? <b>{a}</b> : a}
            </div>
          ))}

          {documento.daIndicare.length > 0 && (
            <div className="note-box" style={{ marginBottom: 14 }}>
              <b>Da completare:</b> {documento.daIndicare.join(", ")}.
            </div>
          )}

          <a href={`/contratto/${id}/pdf`} className="opp-cta" download style={{ display: "inline-block", marginBottom: 20 }}>
            Scarica il PDF
          </a>
          {documentoSemplificato(documento) && (
            <p className="field-note" style={{ marginTop: -8 }}>
              {AVVISO_CARATTERI_SEMPLIFICATI}
            </p>
          )}

          {documento.sezioni.map((s) => (
            <section key={s.titolo} className="contratto-sezione" style={{ marginBottom: 18 }}>
              <h2 className="pref-label" style={{ margin: "0 0 6px 0" }}>
                <span>{s.titolo}</span>
              </h2>
              {s.paragrafi.map((p, i) => (
                <p key={i} style={{ margin: "0 0 6px 0" }}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          <div className="contratto-firme" style={{ display: "flex", gap: 24, marginTop: 24 }}>
            {documento.firme.map((f) => (
              <div key={f.ruolo} style={{ flex: 1 }}>
                <b>{f.ruolo}</b>
                <div style={{ borderBottom: "1px solid rgba(16,21,26,0.5)", height: 36 }} />
                <small>{f.nome ?? ""}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
