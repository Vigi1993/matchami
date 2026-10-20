/**
 * Le spiegazioni di match, affidabilità e recensioni che l'utente può rileggere DOPO l'iscrizione: la pagina «Come funziona» (dal Profilo) e le domande
 * frequenti, per ruolo. Come i testi del benvenuto, i NUMERI (pesi, punti, soglie, fasce, limiti) non sono scritti a mano: arrivano dalle stesse costanti
 * che usa il calcolo vero, così le spiegazioni non possono dire una cosa diversa da ciò che l'app fa. Logica pura: si prova con `npm test`.
 */
import { PUNTI_AFFIDABILITA, PUNTEGGIO_MASSIMO, PUNTEGGIO_MINIMO } from "@/lib/affidabilita";
import { testiIntro, type BloccoIntro, type Ruolo } from "@/lib/benvenuto-testi";
import {
  PESI_INQUILINO,
  PESI_INQUILINO_SENZA_CARATTERISTICHE,
  PESO_MAX,
  PESO_MIN,
  PESO_PREDEFINITO,
  PUNTEGGIO_MAX,
  PUNTI_DATO_MANCANTE,
  SOGLIA_PROFILO_COMPLETO,
  SOGLIA_REDDITO_CANONE,
  SOGLIE_ETICHETTE,
  TOLLERANZA_BUDGET,
  ETICHETTA_MINIMA,
} from "@/lib/match/config";
import { CATALOGO_CRITERI, CHIAVI_CRITERI } from "@/lib/match/proprietario";
import { ANNI_VALIDITA, AUTORI_DIVERSI_MINIMI, NOME_BADGE_RACCOMANDATO, VOTO_MASSIMO, VOTO_MINIMO, VOTO_NEGATIVO_MASSIMO, VOTO_POSITIVO_MINIMO } from "@/lib/recensioni";

export type { Ruolo };

/** Un blocco della pagina «Come funziona» riletta dal Profilo. In più rispetto al benvenuto: `pesi` (quanto pesa ogni parte del match). */
export type BloccoGuida = Omit<BloccoIntro, "id"> & { id: string; pesi?: { etichetta: string; valore: string }[] };
export type DomandaFrequente = { q: string; a: string };

const percento = (frazione: number) => `${Math.round(frazione * 100)}%`;
const elenco = (voci: readonly string[]) => (voci.length <= 1 ? (voci[0] ?? "") : `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}`);

/** Una sola frase, usata dalla pagina e dalle domande: chi può avere il badge e cosa vuol dire. */
export function fraseBadge(): string {
  return `Con almeno ${AUTORI_DIVERSI_MINIMI} recensioni positive (${VOTO_POSITIVO_MINIMO}-${VOTO_MASSIMO} stelle) di proprietari diversi negli ultimi ${ANNI_VALIDITA} anni, e nessuna negativa (${VOTO_NEGATIVO_MASSIMO} stelle o meno), si ottiene il badge «${NOME_BADGE_RACCOMANDATO}»: a parità di match passa avanti.`;
}

/** Le recensioni stanno a parte dall'affidabilità: lo dice chiaramente, perché è la cosa che più si fraintende. */
export function fraseRecensioni(ruolo: Ruolo): string {
  const chi = ruolo === "inquilino" ? "Le lasciano i proprietari dopo un affitto confermato" : "Le lasci tu, dopo un affitto confermato, e le lasciano gli altri proprietari";
  return `Le recensioni vanno da ${VOTO_MINIMO} a ${VOTO_MASSIMO} stelle, con qualità scelte da un elenco. ${chi}. Non entrano nell'affidabilità né nella percentuale di match: si vedono a parte.`;
}

export function fraseEtichette(): string {
  const s = SOGLIE_ETICHETTE.map((e) => `da ${e.da} «${e.etichetta}»`);
  return `Le parole: ${s.join(", ")}, sotto ${SOGLIE_ETICHETTE[SOGLIE_ETICHETTE.length - 1].da} «${ETICHETTA_MINIMA}».`;
}

export function fraseMassimo(): string {
  return `Il massimo è ${PUNTEGGIO_MAX}: la percentuale non arriva mai al pieno, perché sono dati dichiarati dalle persone, non una garanzia.`;
}

// ---------------------------------------------------------------- inquilino: il match
function pesiInquilino(): { etichetta: string; valore: string }[] {
  const p = PESI_INQUILINO;
  return [
    { etichetta: "Budget", valore: `${p.budget} punti` },
    { etichetta: "Zona", valore: `${p.zona} punti` },
    { etichetta: "Locali", valore: `${p.locali} punti` },
    { etichetta: "Metri quadri", valore: `${p.mq} punti` },
    { etichetta: "Caratteristiche", valore: `${p.caratteristiche} punti` },
  ];
}

function paragrafiMatchInquilino(): string[] {
  const s = PESI_INQUILINO_SENZA_CARATTERISTICHE;
  return [
    `La percentuale somma cinque parti, per un totale di ${Object.values(PESI_INQUILINO).reduce((a, b) => a + b, 0)} punti: budget, zona, locali, metri quadri e caratteristiche. Se non scegli nessuna caratteristica, le altre quattro valgono ${s.budget}, ${s.zona}, ${s.locali} e ${s.mq}.`,
    `Budget: se la casa costa quanto il tuo massimo prende una buona parte dei punti; più costa meno, più sale, fino al pieno; sopra il massimo i punti calano fino a zero. Zona: pieno se la casa sta in uno dei luoghi che hai scelto (scegliere una città copre tutti i suoi quartieri). Locali e metri quadri: pieno se la casa sta nell'intervallo che indichi.`,
    `Caratteristiche: quelle «necessarie» non danno punti, sono un cancello (senza, la casa non compare); quelle «preferite» hanno un peso da ${PESO_MIN} a ${PESO_MAX} e fanno salire la percentuale. ${fraseMassimo()} ${fraseEtichette()}`,
    `Una casa può essere in linea con la tua ricerca (rispetta tutto), oltre la tua ricerca (compare in fondo, con il motivo: per esempio costa fino al ${percento(TOLLERANZA_BUDGET)} più del tuo budget, o ha meno locali del tuo minimo) oppure esclusa (non te la mostriamo: tipologia diversa, budget superato di oltre il ${percento(TOLLERANZA_BUDGET)}, o manca una caratteristica necessaria).`,
    `Se il proprietario non ha indicato un dato (per esempio i metri quadri) prendi il ${percento(PUNTI_DATO_MANCANTE)} dei punti di quella voce e lo vedi segnato: non vieni penalizzato per una dimenticanza di un altro.`,
  ];
}

// ---------------------------------------------------------------- proprietario: il match
function paragrafiMatchProprietario(): string[] {
  const nomi = CHIAVI_CRITERI.map((k) => CATALOGO_CRITERI[k].nome.toLowerCase());
  const { min, max, predefinita } = SOGLIA_REDDITO_CANONE;
  return [
    `Per ogni casa scegli fino a ${CHIAVI_CRITERI.length} criteri: ${elenco(nomi)}. Per il reddito decidi la soglia (dal ${min}% al ${max}% del reddito del nucleo, di partenza ${predefinita}%); il profilo è «completo» da ${SOGLIA_PROFILO_COMPLETO}% dei campi compilati.`,
    `Ogni criterio è obbligatorio o preferenziale, e ha un peso da ${PESO_MIN} a ${PESO_MAX} (di partenza ${PESO_PREDEFINITO}). La percentuale è la quota di peso dei criteri soddisfatti sul peso totale. ${fraseMassimo()} ${fraseEtichette()}`,
    `Se un criterio obbligatorio non è soddisfatto la persona risulta «bloccata», ma la sua percentuale resta visibile e puoi comunque scegliere. Un dato che la persona non ha indicato conta come non soddisfatto, ma si legge «non indicato», non «no»: se lo compila, la percentuale può salire. Senza nessun criterio non c'è una percentuale.`,
    "Non esistono criteri sulla composizione della famiglia (figli, persone nel nucleo): è una scelta voluta, per non discriminare.",
  ];
}

const bloccoPossibili = (): BloccoGuida => ({
  id: "possibili",
  titolo: "Possibili match: chi cerca una casa come la tua",
  paragrafi: [
    "Sono gli inquilini per cui la tua casa rispetta tutto ciò che cercano: tipologia, budget (tra il minimo e il massimo), zona, locali, metri quadri e le caratteristiche necessarie. Compaiono solo se la casa è pubblicata e verificata dal nostro staff.",
    "Chi ha scelto di non farsi trovare viene contato ma non si può contattare, e i contatti di nessuno sono visibili: se una persona accetta la tua richiesta, o si candida, potete scrivervi in chat.",
    "Se ne vedi pochi, di solito la casa è fuori dalle ricerche per canone, locali o metri quadri, o manca una caratteristica che per qualcuno è necessaria (per esempio gli animali ammessi). Controlla i dati dell'annuncio: più sono completi e più sono precisi i risultati.",
  ],
});

const bloccoOrdinamento = (): BloccoGuida => ({
  id: "ordinamento",
  titolo: "Come ordinare le persone nel Database",
  paragrafi: [
    "In alto scegli il criterio con cui ordinare: affidabilità, match o recensioni, ognuno con il suo colore. Toccando di nuovo lo stesso criterio inverti l'ordine, dal più alto al più basso. Il numero accanto al nome è il valore del criterio scelto.",
    "Chi non ha il dato (per esempio nessuna recensione) resta sempre in fondo. A parità di valore passa avanti chi ha il badge «" + NOME_BADGE_RACCOMANDATO + "», poi chi ha di più negli altri criteri.",
  ],
});

const bloccoRecensioni = (ruolo: Ruolo): BloccoGuida => ({ id: "recensioni", titolo: "Recensioni e badge «" + NOME_BADGE_RACCOMANDATO + "»", paragrafi: [fraseRecensioni(ruolo), fraseBadge()] });

function bloccoDa(ruolo: Ruolo, id: BloccoIntro["id"]): BloccoIntro {
  const b = testiIntro(ruolo).blocchi.find((x) => x.id === id);
  if (!b) throw new Error(`blocco «${id}» mancante nel benvenuto`);
  return b;
}

/**
 * La pagina «Come funziona» riletta dal Profilo: gli stessi blocchi del benvenuto (cos'è, match, affidabilità) ma più completi, e senza le frasi che
 * parlano del percorso di iscrizione («te li chiederemo alla fine di questi passaggi»).
 */
export function testiGuida(ruolo: Ruolo): { blocchi: BloccoGuida[] } {
  const cosa = bloccoDa(ruolo, "cosa");
  const match = bloccoDa(ruolo, "match");
  const aff = bloccoDa(ruolo, "affidabilita");
  if (ruolo === "inquilino") {
    return {
      blocchi: [
        cosa,
        { ...match, paragrafi: [...match.paragrafi, ...paragrafiMatchInquilino()], pesi: pesiInquilino() },
        aff,
        bloccoRecensioni(ruolo),
        {
          id: "documenti",
          titolo: "Perché conviene verificare i documenti",
          paragrafi: [
            "Ciò che dichiari vale poco, ciò che il nostro staff verifica vale molto. Il reddito dà punti solo se verificato: con le sole dichiarazioni non si va oltre «Buona».",
            "Puoi caricare o completare i documenti in ogni momento dal Profilo, aprendo la scheda dell'affidabilità («Vedi e modifica i tuoi dati»). I documenti li vede solo il nostro staff: al proprietario arriva soltanto «verificato», sì o no.",
          ],
        },
      ],
    };
  }
  return {
    blocchi: [
      cosa,
      { ...match, paragrafi: [...match.paragrafi, ...paragrafiMatchProprietario()] },
      bloccoPossibili(),
      aff,
      bloccoRecensioni(ruolo),
      bloccoOrdinamento(),
      {
        id: "documenti",
        titolo: "Perché è importante verificare la tua casa",
        paragrafi: [
          "Gli inquilini vedono il tuo annuncio, e tu vedi i possibili match, solo dopo che il nostro staff ha verificato che la casa è tua: servono il tuo documento d'identità e la visura catastale o l'atto di proprietà.",
          "Puoi caricarli o completarli in ogni momento dalla scheda della casa, in Immobili. Finché non lo fai la casa resta invisibile.",
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------- le domande frequenti
const FAQ_BONUS: readonly DomandaFrequente[] = [
  { q: "Bonus giovani per l'affitto", a: "Diverse misure nazionali e regionali prevedono agevolazioni per chi ha meno di 31 anni e affitta un immobile lontano dalla residenza dei genitori. Requisiti e importi cambiano spesso: verifica sul sito dell'Agenzia delle Entrate o del tuo Comune quali sono attive quest'anno." },
  { q: "Detrazioni 730 per l'affitto", a: "Chi vive in affitto come abitazione principale può avere diritto a una detrazione IRPEF, con importi diversi in base al reddito e al tipo di contratto (libero, concordato, giovani under 31). Il commercialista o il CAF che ti segue può calcolare l'importo esatto in base alla tua situazione." },
  { q: "Contributi comunali per l'affitto", a: "Molti Comuni, incluso il Comune di Milano, pubblicano periodicamente bandi di sostegno all'affitto per chi rientra in determinate fasce ISEE. Le finestre di apertura cambiano ogni anno: conviene controllare direttamente sul sito del proprio Comune." },
];
const FAQ_FIDEIUSSIONE: DomandaFrequente = { q: "Cos'è la fideiussione bancaria/assicurativa", a: "È una garanzia che una banca o un'assicurazione offre al posto (o in aggiunta) al deposito cauzionale: se l'inquilino non paga, interviene l'ente garante. Va attivata con un intermediario finanziario, non è ancora un servizio diretto di MatchAmI." };

function domandaAffidabilita(ruolo: Ruolo): DomandaFrequente {
  const p = PUNTI_AFFIDABILITA;
  const chi = ruolo === "inquilino" ? "I proprietari lo vedono accanto alla tua candidatura" : "Lo vedi accanto a ogni candidato";
  return {
    q: "Come funziona il voto di affidabilità",
    a: `È un numero da ${PUNTEGGIO_MINIMO} a ${PUNTEGGIO_MASSIMO}. ${chi}. Si costruisce con ciò che lo staff ha verificato: reddito verificato +${p.reddito}, nessun protesto +${p.protesti} (dichiarato, o verificato sul certificato), garante o fideiussione +${p.garanzia}; i protesti, o la risposta non data, tolgono ${p.protesti}. Il reddito dà punti solo se verificato. Le recensioni NON ne fanno parte: si vedono a parte.`,
  };
}

function domandaRecensioni(ruolo: Ruolo): DomandaFrequente {
  return { q: `Come funzionano le recensioni e il badge «${NOME_BADGE_RACCOMANDATO}»`, a: `${fraseRecensioni(ruolo)} ${fraseBadge()}` };
}

export function domandeFrequenti(ruolo: Ruolo): DomandaFrequente[] {
  if (ruolo === "inquilino") {
    return [
      { q: "Come funziona il match", a: `${paragrafiMatchInquilino().slice(0, 1).join(" ")} ${fraseMassimo()} ${fraseEtichette()}` },
      { q: "Perché vedo una casa «oltre la tua ricerca»?", a: `È una casa che rispetta quasi tutto ma sfora un limite: per esempio costa fino al ${percento(TOLLERANZA_BUDGET)} più del tuo budget, sta fuori dalle tue zone o ha meno locali del tuo minimo. Compare in fondo, con il motivo scritto. Oltre il ${percento(TOLLERANZA_BUDGET)} di budget, o senza una caratteristica necessaria, non la vedi.` },
      domandaAffidabilita(ruolo),
      domandaRecensioni(ruolo),
      ...FAQ_BONUS,
      FAQ_FIDEIUSSIONE,
    ];
  }
  return [
    { q: "Come funziona il match", a: paragrafiMatchProprietario().slice(0, 3).join(" ") },
    { q: "Perché vedo pochi possibili match?", a: bloccoPossibili().paragrafi.join(" ") },
    domandaAffidabilita(ruolo),
    domandaRecensioni(ruolo),
    { q: "Come ordino le persone nel Database", a: bloccoOrdinamento().paragrafi.join(" ") },
    FAQ_FIDEIUSSIONE,
  ];
}
