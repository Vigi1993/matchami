import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { IconBusta, IconPalazzo, IconPersone } from "@/components/icons";
import {
  DESTINAZIONI_HOME,
  dettagliCasa,
  fraseCandidature,
  frasePossibili,
  inviteDaValutare,
  saluto,
  statoCasa,
  testoPrezzo,
  type CasaHome,
} from "@/lib/proprietario/home";

/**
 * La Home del proprietario: la sua casa in grande (quasi tutti ne hanno una sola) e sotto due tessere grandi, «Possibili
 * inquilini» e «Candidature». Parole semplici, caratteri grandi, un solo gesto per andare dove serve:
 *  - toccare la casa porta a «Immobili»;
 *  - toccare una tessera porta al «Database».
 * Con più case, ognuna ha la sua scheda (più compatta).
 */
export function OwnerHomeClient({ case_, nome, ora }: { case_: CasaHome[]; nome: string | null; ora: number }) {
  const totaleDaValutare = case_.reduce((somma, c) => somma + c.daValutare, 0);
  const invito = inviteDaValutare(totaleDaValutare);

  return (
    <PageContainer wide>
      <p className="casa-saluto">{saluto(nome, ora)}</p>
      <h1 className="screen-title">{case_.length === 1 ? "La tua casa" : "Le tue case"}</h1>

      {/* Se c'è qualcosa da fare lo si dice per primo, con un pulsante grande */}
      {invito && (
        <Link href={DESTINAZIONI_HOME.candidature} className="casa-invito">
          <span>{invito}</span>
          <b>Guarda ›</b>
        </Link>
      )}

      {case_.length === 0 ? (
        <div className="empty-inline">
          <IconPalazzo className="icon-empty" />
          <h3>Non hai ancora nessuna casa</h3>
          <p>Per cominciare, aggiungi la tua casa.</p>
          <Link href={DESTINAZIONI_HOME.immobili} className="casa-invito" style={{ marginTop: 14 }}>
            <span>Aggiungi la tua casa</span>
            <b>Vai ›</b>
          </Link>
        </div>
      ) : (
        case_.map((c) => <Casa key={c.id} casa={c} compatta={case_.length > 1} />)
      )}
    </PageContainer>
  );
}

function Casa({ casa, compatta }: { casa: CasaHome; compatta: boolean }) {
  const stato = statoCasa(casa);
  const dettagli = [testoPrezzo(casa.prezzo), ...dettagliCasa(casa)].join(" · ");
  const visibile = stato.chiave === "pubblicata";
  const cand = fraseCandidature(casa.nCandidature);
  const poss = casa.possibili === null ? null : frasePossibili(casa.possibili);

  return (
    <article className={`casa ${compatta ? "compatta" : ""}`} aria-label={`Casa: ${casa.titolo}`}>
      {/* Toccare la casa: Immobili */}
      <Link href={DESTINAZIONI_HOME.immobili} className="casa-hero" aria-label={`${casa.titolo}, ${casa.zona}. ${stato.testo}. Tocca per vedere o modificare la casa`}>
        {casa.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={casa.foto} alt="" className="casa-foto" />
        ) : (
          <span className="casa-foto casa-foto-vuota" aria-hidden="true">
            <IconPalazzo className="casa-icona-vuota" />
          </span>
        )}
        <span className="casa-sfumatura" aria-hidden="true" />
        <span className={`casa-stato is-${stato.chiave}`}>
          <i aria-hidden="true" /> {stato.testo}
        </span>
        <span className="casa-modifica" aria-hidden="true">
          Vedi o modifica ›
        </span>
        <span className="casa-testo">
          <span className="casa-zona">{casa.zona}</span>
          <span className="casa-titolo">{casa.titolo}</span>
          <span className="casa-dati">{dettagli}</span>
        </span>
      </Link>

      {visibile ? (
        <div className={`casa-tessere ${poss === null ? "una" : ""}`}>
          {/* Toccare i possibili inquilini o le candidature: Database */}
          {poss !== null && (
            <Link href={DESTINAZIONI_HOME.possibili} className="tessera" aria-label={`Possibili inquilini: ${poss.numero} ${poss.frase}. Tocca per guardare`}>
              <span className="tessera-etichetta">
                <IconPersone className="tessera-icona" /> Possibili inquilini
              </span>
              <span className="tessera-numero">{poss.numero}</span>
              <span className="tessera-frase">{poss.frase}</span>
              <span className="tessera-vai">Guarda ›</span>
            </Link>
          )}
          <Link href={DESTINAZIONI_HOME.candidature} className="tessera" aria-label={`Candidature: ${cand.numero} ${cand.frase}${casa.daValutare > 0 ? `, ${casa.daValutare} da valutare` : ""}. Tocca per guardare`}>
            <span className="tessera-etichetta">
              <IconBusta className="tessera-icona" /> Candidature
            </span>
            <span className="tessera-numero">{cand.numero}</span>
            <span className="tessera-frase">{cand.frase}</span>
            {casa.daValutare > 0 && <span className="tessera-badge">{casa.daValutare} da valutare</span>}
            <span className="tessera-vai">Guarda ›</span>
          </Link>
        </div>
      ) : (
        <Link href={DESTINAZIONI_HOME.immobili} className="casa-attesa">
          <span>{stato.spiegazione}</span>
          <b>Vai alla casa ›</b>
        </Link>
      )}
    </article>
  );
}
