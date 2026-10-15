import { IconRaccomandato } from "@/components/icons";
import { NOME_BADGE_RACCOMANDATO } from "@/lib/recensioni";

/**
 * Il badge «Inquilino raccomandato»: si vede nella Home e nella scheda dei dati dell'inquilino, e sulle candidature che
 * vede il proprietario. `compatto` è la versione per le liste, dove il nome intero non ci sta: si legge «Raccomandato»,
 * ma chi usa un lettore di schermo sente il nome intero.
 */
export function BadgeRaccomandato({ compatto = false }: { compatto?: boolean }) {
  return (
    <span className={`badge-raccomandato ${compatto ? "compatto" : ""}`} title="Almeno due recensioni positive da due proprietari diversi">
      <IconRaccomandato className="badge-raccomandato-icona" />
      {compatto ? (
        <>
          <span aria-hidden="true">Raccomandato</span>
          <span className="solo-lettori">{NOME_BADGE_RACCOMANDATO}</span>
        </>
      ) : (
        <span>{NOME_BADGE_RACCOMANDATO}</span>
      )}
    </span>
  );
}
