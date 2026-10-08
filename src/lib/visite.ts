/**
 * Le visite agli immobili: come si interpreta e si mostra una data, quali
 * date si possono proporre, come si raggruppano. Logica pura, senza database:
 * si prova con `npm test`.
 *
 * Le regole vere (anticipo, distanza tra i posti, quanti ce ne possono essere,
 * chi può prenotare) stanno nelle funzioni del database (migrazione 0022); qui
 * si rispecchiano per dare un errore chiaro prima di chiamarle.
 *
 * LE DATE. Il database conserva un istante (UTC). L'app è pensata per Milano:
 * ciò che la persona scrive e legge è SEMPRE l'ora di Roma, qualunque sia il
 * fuso del suo telefono. Questo conta due volte l'anno (ora legale), e il
 * 25 ottobre 2026 è una di quelle.
 */

export const ZONA_ORARIA = "Europe/Rome";

// ------------------------------------------------------------
// Le regole del database, rispecchiate (un test le tiene allineate)
// ------------------------------------------------------------

/** Un posto si può offrire solo tra almeno un'ora... */
export const ANTICIPO_MINIMO_ORE = 1;
/** ...e non oltre novanta giorni. */
export const ANTICIPO_MASSIMO_GIORNI = 90;
/** Due posti sullo stesso immobile distano almeno questo: una visita occupa tempo. */
export const DISTANZA_MINIMA_MINUTI = 30;
/** Al massimo tanti posti liberi per immobile. */
export const MASSIMO_POSTI_LIBERI = 30;
/** Un posto si prenota solo con almeno questo margine. */
export const MARGINE_PRENOTAZIONE_MINUTI = 30;

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;

// ------------------------------------------------------------
// Date in ora di Roma
// ------------------------------------------------------------

type Parti = { anno: number; mese: number; giorno: number; ora: number; minuto: number };

const formato = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_ORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** L'anno, il mese, il giorno, l'ora e il minuto che a Roma corrispondono a un istante. */
function partiRoma(istante: number): Parti {
  const p = Object.fromEntries(formato.formatToParts(new Date(istante)).map((x) => [x.type, x.value]));
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: +p.hour, minuto: +p.minute };
}

const due = (n: number) => String(n).padStart(2, "0");

/**
 * Da «2026-10-12T10:00» (quello che dà un campo data e ora) all'istante in
 * cui a Roma sono le 10:00 di quel giorno, in formato ISO. Nullo se non è una
 * data valida o se quell'ora a Roma NON ESISTE (nella notte in cui si passa
 * all'ora legale, le 02:30 saltano). Se un'ora esiste DUE volte (nella notte in
 * cui si torna all'ora solare) si sceglie la prima, sempre.
 */
export function daInputRoma(valore: unknown): string | null {
  if (typeof valore !== "string") return null;
  const m = valore.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [anno, mese, giorno, ora, minuto] = m.slice(1).map(Number);
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31 || ora > 23 || minuto > 59) return null;

  const nominale = Date.UTC(anno, mese - 1, giorno, ora, minuto);

  // Roma è a +1 (inverno) o +2 (estate) rispetto a UTC: si provano tutti e due e si tiene
  // quello per cui a Roma risulta proprio l'ora scritta. Lo stesso confronto scarta anche i
  // giorni che non esistono (il 31 aprile diventerebbe il 1° maggio) e le ore che saltano.
  const candidati = [2, 1]
    .map((offset) => nominale - offset * ORA)
    .filter((c) => {
      const p = partiRoma(c);
      return p.anno === anno && p.mese === mese && p.giorno === giorno && p.ora === ora && p.minuto === minuto;
    })
    .sort((a, b) => a - b); // se due: la prima in ordine di tempo
  return candidati.length > 0 ? new Date(candidati[0]).toISOString() : null;
}

/** L'inverso: da un istante a «2026-10-12T10:00», per riempire un campo data e ora. */
export function aInputRoma(istante: string | number | Date): string {
  const t = new Date(istante).getTime();
  if (Number.isNaN(t)) return "";
  const p = partiRoma(t);
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}T${due(p.ora)}:${due(p.minuto)}`;
}

/** Il giorno a Roma, «2026-10-12»: per raggruppare. */
export function chiaveGiorno(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const p = partiRoma(t);
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}`;
}

const nomeGiorno = new Intl.DateTimeFormat("it-IT", { timeZone: ZONA_ORARIA, weekday: "long", day: "numeric", month: "long" });
const nomeOra = new Intl.DateTimeFormat("it-IT", { timeZone: ZONA_ORARIA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** «lunedì 12 ottobre» */
export function formattaGiorno(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : nomeGiorno.format(new Date(t));
}

/** «10:00» */
export function formattaOra(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : nomeOra.format(new Date(t));
}

/** «lunedì 12 ottobre · 10:00». Una data illeggibile dà una stringa vuota, non «Invalid Date». */
export function formattaQuando(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const g = formattaGiorno(iso);
  return g ? `${g} · ${formattaOra(iso)}` : "";
}

// ------------------------------------------------------------
// Proporre un posto
// ------------------------------------------------------------

/**
 * Cosa non va in un posto che il proprietario vuole aggiungere, con le regole
 * del database: da almeno un'ora, entro novanta giorni, a mezz'ora dagli altri,
 * e non più di trenta liberi. Nullo se va bene.
 *
 * `esistenti` sono i posti già presenti sull'immobile (liberi e prenotati),
 * `liberi` quanti sono già liberi in futuro.
 */
export function validaNuovoPosto(
  iso: string | null,
  adesso: number,
  esistenti: string[],
  liberi: number
): string | null {
  if (iso === null) return "Scegli una data e un'ora valide.";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Scegli una data e un'ora valide.";
  if (t < adesso + ANTICIPO_MINIMO_ORE * ORA) return "Il posto deve essere tra almeno un'ora.";
  if (t > adesso + ANTICIPO_MASSIMO_GIORNI * GIORNO) return `Il posto deve essere entro ${ANTICIPO_MASSIMO_GIORNI} giorni.`;
  if (liberi >= MASSIMO_POSTI_LIBERI) return `Hai già ${MASSIMO_POSTI_LIBERI} posti liberi su questo immobile: toglierne uno, o aspetta che qualcuno prenoti.`;

  // il database tronca al minuto: lo si fa anche qui
  const minuto = Math.floor(t / MINUTO) * MINUTO;
  const vicino = esistenti.some((e) => {
    const x = Date.parse(e);
    return !Number.isNaN(x) && Math.abs(x - minuto) < DISTANZA_MINIMA_MINUTI * MINUTO;
  });
  if (vicino) return `Tra due visite sullo stesso immobile servono almeno ${DISTANZA_MINIMA_MINUTI} minuti.`;

  return null;
}

/** Il primo e l'ultimo istante che si possono scegliere, per i limiti del campo data e ora. */
export function limitiSelezione(adesso: number): { min: string; max: string } {
  return {
    min: aInputRoma(adesso + ANTICIPO_MINIMO_ORE * ORA),
    max: aInputRoma(adesso + ANTICIPO_MASSIMO_GIORNI * GIORNO),
  };
}

// ------------------------------------------------------------
// Le visite, raggruppate
// ------------------------------------------------------------

/** Una riga di `visite_del_proprietario`. */
export type VisitaProprietario = {
  visita_id: string;
  listing_id: string;
  titolo: string;
  data_ora: string;
  stato: string;
  candidatura_id: string | null;
  nome_inquilino: string | null;
};

/** Una riga di `posti_liberi_per_candidatura`. */
export type PostoLibero = { visita_id: string; data_ora: string };

/** Una riga di `visite_della_candidatura`. */
export type VisitaCandidatura = { visita_id: string; data_ora: string; stato: string };

/**
 * Le visite di UN immobile, divise per come si presentano al proprietario.
 * Ordine: dalla più vicina. Una visita è passata se la data lo è, qualunque
 * sia lo stato (l'app non sposta lo stato a visita finita).
 */
export function raggruppaVisiteImmobile(
  righe: VisitaProprietario[],
  immobileId: string,
  adesso: number
): { prenotate: VisitaProprietario[]; liberi: VisitaProprietario[]; chiuse: VisitaProprietario[] } {
  const dellImmobile = righe
    .filter((r) => r.listing_id === immobileId)
    .sort((a, b) => Date.parse(a.data_ora) - Date.parse(b.data_ora));
  const futura = (r: VisitaProprietario) => Date.parse(r.data_ora) > adesso;
  return {
    prenotate: dellImmobile.filter((r) => r.stato === "confermata" && futura(r)),
    liberi: dellImmobile.filter((r) => r.stato === "proposta" && r.candidatura_id === null && futura(r)),
    // le passate e le annullate, la più recente per prima
    chiuse: dellImmobile
      .filter((r) => !futura(r) || r.stato === "rifiutata")
      .sort((a, b) => Date.parse(b.data_ora) - Date.parse(a.data_ora)),
  };
}

/** I posti raggruppati per giorno, nell'ordine in cui arrivano. */
export function raggruppaPostiPerGiorno(posti: PostoLibero[]): { chiave: string; etichetta: string; posti: PostoLibero[] }[] {
  const gruppi: { chiave: string; etichetta: string; posti: PostoLibero[] }[] = [];
  for (const p of posti) {
    const chiave = chiaveGiorno(p.data_ora);
    if (!chiave) continue;
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.chiave === chiave) ultimo.posti.push(p);
    else gruppi.push({ chiave, etichetta: formattaGiorno(p.data_ora), posti: [p] });
  }
  return gruppi;
}

/** La visita confermata e non ancora passata di una candidatura, se c'è. */
export function visitaAttiva(visite: VisitaCandidatura[], adesso: number): VisitaCandidatura | null {
  return (
    visite
      .filter((v) => v.stato === "confermata" && Date.parse(v.data_ora) > adesso)
      .sort((a, b) => Date.parse(a.data_ora) - Date.parse(b.data_ora))[0] ?? null
  );
}

/** L'ultima visita annullata dal proprietario e non ancora passata: la persona deve saperlo. */
export function visitaAnnullataRecente(visite: VisitaCandidatura[], adesso: number): VisitaCandidatura | null {
  return (
    visite
      .filter((v) => v.stato === "rifiutata" && Date.parse(v.data_ora) > adesso)
      .sort((a, b) => Date.parse(a.data_ora) - Date.parse(b.data_ora))[0] ?? null
  );
}

// ------------------------------------------------------------
// Testi
// ------------------------------------------------------------

export const SUGGERIMENTO_POSTI =
  "Gli inquilini con un match su questo immobile potranno prenotare uno di questi posti dalla chat.";

export const NESSUN_POSTO_PER_INQUILINO =
  "Il proprietario non ha ancora indicato quando è disponibile. Puoi chiederglielo qui in chat.";

export const NESSUNA_VISITA_PER_PROPRIETARIO =
  "Nessuna visita fissata con questa persona. Puoi indicare i tuoi posti liberi dalla scheda dell'immobile.";

export const AVVISO_ANNULLAMENTO_AL_PROPRIETARIO = "L'inquilino verrà avvisato.";
export const AVVISO_ANNULLAMENTO_ALL_INQUILINO = "Il proprietario verrà avvisato e il posto tornerà libero.";
