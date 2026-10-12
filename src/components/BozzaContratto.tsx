import Link from "next/link";

/**
 * Nei pannelli dei contratti: «Vedi la bozza» e «Scarica il PDF». Il PDF è un collegamento normale
 * (si scarica, non si apre dentro l'app). Finché il modello è quello di prova lo dice.
 */
export function BozzaContratto({ contrattoId }: { contrattoId: string }) {
  return (
    <div className="bozza-contratto" style={{ margin: "14px 0 18px 0" }}>
      <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
        <span>Documento</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 8px 0" }}>
        Una bozza di prova con i dati di questo affitto. Non ha valore legale.
      </p>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href={`/contratto/${contrattoId}`} className="redo-link">
          Vedi la bozza
        </Link>
        <a href={`/contratto/${contrattoId}/pdf`} className="redo-link" download>
          Scarica il PDF
        </a>
      </div>
    </div>
  );
}
