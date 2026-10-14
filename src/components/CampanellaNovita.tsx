import Link from "next/link";
import { IconCampana } from "@/components/icons";
import { etichettaConteggio, sottotitoloNovita } from "@/lib/notifiche";

/**
 * La campanella delle novità, nell'angolo in alto del Profilo: porta all'elenco delle notifiche e, se ce ne sono da
 * leggere, mostra il numero. Sostituisce la riga «Novità» che stava tra le altre.
 */
export function CampanellaNovita({ nonLette }: { nonLette: number }) {
  const numero = etichettaConteggio(nonLette);
  return (
    <Link href="/notifiche" className={`campanella ${numero ? "con-novita" : ""}`} aria-label={`Novità. ${sottotitoloNovita(nonLette)}`}>
      <IconCampana className="campanella-icona" />
      {numero && (
        <span className="campanella-numero" aria-hidden="true">
          {numero}
        </span>
      )}
    </Link>
  );
}
