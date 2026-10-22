/**
 * I testi del percorso di benvenuto: la pagina «Come funziona» (cosa vuol dire match e affidabilità, perché contano i documenti) e le note che dicono,
 * durante l'iscrizione, che dopo verrà chiesta la documentazione. I numeri (punti, fasce, soglie) NON sono scritti a mano: vengono dalle stesse costanti
 * che usa il punteggio vero, così le spiegazioni non possono dire una cosa diversa da ciò che l'app fa. Logica pura: si prova con `npm test`.
 */
import { PUNTI_AFFIDABILITA, PUNTEGGIO_MASSIMO, fasceAffidabilita } from "@/lib/affidabilita";
import { VALIDITA_MESI } from "@/lib/scadenze-verifiche";
import { NOME_BADGE_RACCOMANDATO } from "@/lib/recensioni";

export type Ruolo = "inquilino" | "proprietario";

export type BloccoIntro = {
  id: "cosa" | "match" | "affidabilita" | "documenti" | "adesso";
  titolo: string;
  /** i paragrafi, brevi */
  paragrafi: string[];
  /** per l'affidabilità: le voci che danno o tolgono punti */
  voci?: { etichetta: string; valore: string; tono: "piu" | "meno" }[];
  /** per l'affidabilità: le fasce («Scarsa 0-29»...) */
  fasce?: { etichetta: string; intervallo: string }[];
};

export type TestiIntro = { blocchi: BloccoIntro[] };

const piu = (n: number) => `+${n}`;
const meno = (n: number) => `−${n}`;

/** Le fasce come si leggono: «Scarsa · 0-29». */
export function fasceTesto(): { etichetta: string; intervallo: string }[] {
  return fasceAffidabilita().map((f) => ({ etichetta: f.label, intervallo: `${f.da}-${f.a}` }));
}

/** Il numero di schede che seguono la pagina «Come funziona» (per dirlo: «5 schede»). */
export const SCHEDE_DOPO_INTRO = { inquilino: 5, proprietario: 3 } as const;

const VOCI_AFFIDABILITA: BloccoIntro["voci"] = [
  { etichetta: "Reddito verificato dal nostro staff", valore: piu(PUNTI_AFFIDABILITA.reddito), tono: "piu" },
  { etichetta: "Nessun protesto", valore: piu(PUNTI_AFFIDABILITA.protesti), tono: "piu" },
  { etichetta: "Garante o fideiussione", valore: piu(PUNTI_AFFIDABILITA.garanzia), tono: "piu" },
  { etichetta: "Protesti, o risposta non data", valore: meno(PUNTI_AFFIDABILITA.protesti), tono: "meno" },
];

export function testiIntro(ruolo: Ruolo): TestiIntro {
  if (ruolo === "inquilino") {
    return {
      blocchi: [
        {
          id: "cosa",
          titolo: "Cos'è MatchAmI",
          paragrafi: [
            "Cerchi casa tra annunci verificati, e i proprietari scelgono tra persone che hanno un profilo chiaro: chi sei, cosa cerchi, quanto sei affidabile.",
          ],
        },
        {
          id: "match",
          titolo: "Match: quanto una casa va bene per te",
          paragrafi: [
            "È una percentuale che dice quanto una casa somiglia a ciò che cerchi: budget, zone, locali e le caratteristiche che indichi. Più è alta, più la casa fa per te.",
            "Nella tua ricerca scegli cosa è necessario (se la casa non ce l'ha, non te la mostriamo) e cosa è solo preferito (fa salire o scendere la percentuale).",
          ],
        },
        {
          id: "affidabilita",
          titolo: "Affidabilità: quanto i proprietari possono fidarsi di te",
          paragrafi: [
            `È un numero da 0 a ${PUNTEGGIO_MASSIMO} che i proprietari vedono accanto alla tua candidatura. Non cambia la percentuale di match: a parità di match, passa avanti chi ha il badge «${NOME_BADGE_RACCOMANDATO}» e poi chi ha l'affidabilità più alta.`,
            `Una verifica non dura per sempre: il reddito vale ${VALIDITA_MESI.reddito} mesi, i protesti ${VALIDITA_MESI.protesti}, e ti avvisiamo prima che scada. Il reddito dà punti in proporzione a quanto del reddito del nucleo che dichiari è documentato.`,
          ],
          voci: VOCI_AFFIDABILITA,
          fasce: fasceTesto(),
        },
        {
          id: "documenti",
          titolo: "Perché è importante caricare i documenti",
          paragrafi: [
            "Ciò che dichiari vale poco, ciò che il nostro staff verifica vale molto. Il reddito dà punti solo se verificato: con le sole dichiarazioni non si va oltre «Buona».",
            "Per verificarlo servono un documento d'identità e una busta paga, la CU o la dichiarazione dei redditi; per i protesti, il certificato dei protesti. I documenti li vede solo il nostro staff: ai proprietari arriva solo «verificato», sì o no. Se nel tuo nucleo più persone hanno un reddito serve la prova di ognuna, con il suo consenso.",
            "Te li chiederemo alla fine di questi passaggi. Se non li hai sottomano puoi caricarli più tardi, ma finché non lo fai il tuo punteggio resta basso.",
          ],
        },
        {
          id: "adesso",
          titolo: "Cosa facciamo adesso",
          paragrafi: [
            `${SCHEDE_DOPO_INTRO.inquilino} schede, pochi minuti: chi sei, reddito e famiglia, garanzie e protesti, la tua ricerca e infine i documenti.`,
          ],
        },
      ],
    };
  }

  return {
    blocchi: [
      {
        id: "cosa",
        titolo: "Cos'è MatchAmI",
        paragrafi: [
          "Metti online la tua casa e ricevi candidature di persone che hanno un profilo chiaro: chi sono, quanto guadagnano, quanto sono affidabili. Puoi anche contattare tu chi cerca una casa come la tua.",
        ],
      },
      {
        id: "match",
        titolo: "Match: quanto un inquilino va bene per la tua casa",
        paragrafi: [
          "È una percentuale che vedi per ogni persona: quanto il suo profilo risponde ai criteri che scegli tu per la casa. Più è alta, più è adatta.",
          "Per ogni casa decidi cosa conta: un criterio obbligatorio esclude chi non lo rispetta, uno preferenziale fa salire o scendere la percentuale. Quando una persona ti convince fai match: si apre la chat.",
        ],
      },
      {
        id: "affidabilita",
        titolo: "Affidabilità: quanto puoi fidarti di un inquilino",
        paragrafi: [
          `È un numero da 0 a ${PUNTEGGIO_MASSIMO} che vedi accanto a ogni candidato. Non cambia la percentuale di match: a parità di match, passa avanti chi ha il badge «${NOME_BADGE_RACCOMANDATO}» e poi chi ha l'affidabilità più alta.`,
          "Conta di più ciò che il nostro staff ha verificato di ciò che la persona dichiara: sulla scheda vedi se reddito e protesti sono verificati. I documenti non li vedi mai.",
          `Una verifica vale per un periodo (reddito ${VALIDITA_MESI.reddito} mesi, protesti ${VALIDITA_MESI.protesti}): sulla scheda vedi quando è stata fatta; se è scaduta non conta, e se copre solo una parte del reddito del nucleo lo vedi.`,
        ],
        voci: VOCI_AFFIDABILITA,
        fasce: fasceTesto(),
      },
      {
        id: "documenti",
        titolo: "Perché è importante verificare la tua casa",
        paragrafi: [
          "Gli inquilini vedono il tuo annuncio solo dopo che il nostro staff ha verificato che la casa è tua: servono un documento d'identità e la visura catastale o l'atto di proprietà. Li vede solo il nostro staff.",
          "Te li chiederemo durante questi passaggi. Se non li hai sottomano puoi caricarli più tardi, ma finché non lo fai la casa resta invisibile.",
        ],
      },
      {
        id: "adesso",
        titolo: "Cosa facciamo adesso",
        paragrafi: [`${SCHEDE_DOPO_INTRO.proprietario} schede, pochi minuti: i tuoi documenti, la tua casa (con le foto) e la prova di proprietà.`],
      },
    ],
  };
}

/** Le note che dicono, nelle schede dell'iscrizione, che DOPO verrà chiesta la documentazione. */
export const NOTE_DOCUMENTI = {
  reddito:
    "Dopo ti chiederemo la documentazione: nella scheda «I tuoi documenti» caricherai un documento d'identità e una busta paga recente, la CU o la dichiarazione dei redditi. Il nostro staff li controlla. Senza documenti il reddito resta «dichiarato» e non dà punti di affidabilità.",
  protesti:
    "Dopo ti chiederemo la documentazione: nella scheda «I tuoi documenti» caricherai il certificato dei protesti (si chiede alla Camera di Commercio, anche online) e un documento d'identità. Il nostro staff li controlla e il suo risultato vale più di questa risposta.",
} as const;
