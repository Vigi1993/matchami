/**
 * Riconosce, in un messaggio della chat, i discorsi tipici della truffa
 * dell'affitto: una richiesta di soldi prima di aver visto la casa, fatta con
 * un mezzo difficile da annullare.
 *
 * È un CONSIGLIO, non un divieto: non blocca niente, non decide cosa è una
 * truffa, e può sbagliare nei due sensi. Un proprietario onesto può chiedere
 * una caparra dopo la firma; un truffatore può scrivere in modo che nessuna
 * regola lo riconosca. Per questo i livelli sono due e il segnale più debole
 * ha parole misurate: se si avvisa troppo spesso, la gente smette di leggere.
 *
 * Logica pura, senza database: si prova con `npm test`.
 */

export type LivelloRischio = "nessuno" | "attenzione" | "alto";

/**
 * I motivi si leggono dopo «parla di»: «Questo messaggio parla di un IBAN…».
 * Per questo NON cominciano con un articolo determinativo (la, il, lo, le, i, gli, l'),
 * che con «di» si fonderebbe («della», «del»…): «parla di la richiesta» è sbagliato.
 */
export type Rischio = {
  livello: LivelloRischio;
  /** I motivi, in italiano, nell'ordine in cui si controllano (prima i più gravi). */
  segnali: string[];
};

const NESSUNO: Rischio = { livello: "nessuno", segnali: [] };

/** Oltre questa lunghezza si guardano solo l'inizio e la fine del messaggio. */
export const LIMITE_ANALISI = 200_000;

// ------------------------------------------------------------
// Normalizzazione
// ------------------------------------------------------------

/** Minuscole, senza accenti, spazi ridotti. */
function normalizza(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };

/**
 * Chi vuole sfuggire ai filtri scrive «b0nifico», «c4parra» o «b o n i f i c o».
 * Si riconducono queste forme alla parola normale, SOLO dentro le parole (i
 * numeri veri, come gli importi, restano numeri).
 */
function deOfusca(normalizzato: string): string {
  // «b o n i f i c o» → «bonifico»: almeno cinque lettere singole separate
  let t = normalizzato.replace(/\b(?:[a-z][ .\-_*]){4,}[a-z]\b/g, (m) => m.replace(/[ .\-_*]/g, ""));
  // «b0nifico» → «bonifico»: solo in parole che hanno già almeno tre lettere
  t = t
    .split(" ")
    .map((parola) => {
      const lettere = (parola.match(/[a-z]/g) ?? []).length;
      return lettere >= 3 && /[0-9@$]/.test(parola) && /[a-z]/.test(parola)
        ? parola.replace(/[0-9@$]/g, (c) => LEET[c] ?? c)
        : parola;
    })
    .join(" ");
  return t;
}

// ------------------------------------------------------------
// IBAN
// ------------------------------------------------------------

/** La somma di controllo di un IBAN: sposta le prime 4 cifre in fondo, lettere in numeri, resto 1 su 97. */
function ibanValido(candidato: string): boolean {
  const s = candidato.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const riordinato = s.slice(4) + s.slice(0, 4);
  const cifre = riordinato.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const c of cifre) resto = (resto * 10 + Number(c)) % 97;
  return resto === 1;
}

/**
 * Un IBAN scritto di seguito o a gruppi di quattro. Conta se la somma di
 * controllo torna, oppure se comincia come un IBAN italiano (chi lo
 * ricopia male resta comunque un IBAN). Un codice fiscale non lo è: le sue
 * prime sei sono lettere.
 */
function contieneIban(testo: string): boolean {
  const maiuscolo = testo.toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  const candidati = maiuscolo.match(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g) ?? [];
  return candidati.some((c) => ibanValido(c) || /^IT\d{2}/.test(c.replace(/\s+/g, "")));
}

// ------------------------------------------------------------
// I segnali
// ------------------------------------------------------------

type Segnale = {
  livello: Exclude<LivelloRischio, "nessuno">;
  motivo: string;
  /** Si applica al testo normalizzato e de-offuscato. */
  vale: (t: string) => boolean;
};

/** L'IBAN si cerca sul testo ORIGINALE (le maiuscole e i gruppi contano), non su quello normalizzato. */
const MOTIVO_IBAN = "un IBAN o un numero di conto";

/** Parole che dicono che si parla di soldi veri: serve a non scambiare «anticipo la visita» per una richiesta di denaro. */
const CONTESTO_SOLDI = /(\beuro\b|€|\bsoldi\b|\bdenaro\b|\bpagar|\bpagament|\bversar|\bversament|\binvia(re|ti)? .{0,15}\d{2,}|\bbonific|\d{3,})/;

const SEGNALI: Segnale[] = [
  {
    livello: "alto",
    motivo: "un mezzo di pagamento difficile da annullare (Western Union, Postepay, ricariche, criptovalute, buoni regalo)",
    vale: (t) =>
      /\bwestern[ -]?union\b|\bmoney ?gram\b|\bpost[ -]?e[ -]?pay\b|\bposte ?pay\b|\bbitcoin\b|\bcripto(valut|\b)|\bcrypto\b|\bgift ?card\b|\bcarta regalo\b|\bbuoni? (amazon|regalo)\b|\bvaglia\b|\bricaric\w* (la |una |sulla |su )?(carta|postepay|prepagata)\b|\bcarta prepagata\b|\bpaypal\b.{0,30}\b(amici|familiari)\b|\b(amici|familiari)\b.{0,30}\bpaypal\b/.test(
        t
      ),
  },
  {
    livello: "alto",
    motivo: "un pagamento chiesto prima di vedere la casa",
    vale: (t) =>
      /\b(prima di|senza) (vedere|visitare|aver visto|visionare)\b.{0,60}\b(pagar|pagament|caparra|anticipo|acconto|versar|bonific)/.test(t) ||
      /\b(pagar|pagament|caparra|anticipo|acconto|versar|bonific)\w*\b.{0,60}\b(prima di|senza) (vedere|visitare|aver visto|visionare)\b/.test(t) ||
      /\bnon (serve|occorre|e necessario) (vedere|visitare|vedere la casa)\b.{0,60}\b(caparra|anticipo|acconto|pagar)/.test(t),
  },
  {
    livello: "alto",
    motivo: "chiavi da spedire per posta da chi è all'estero",
    // Ciò che distingue la truffa è la storia delle CHIAVI da spedire: «sono all'estero» da solo,
    // o «ti spedisco i documenti», sono frasi qualunque.
    vale: (t) =>
      /\b(sono|mi trovo|vivo|lavoro|risiedo|sto) (attualmente |momentaneamente )?(all'estero|fuori italia|fuori dall'italia|in (inghilterra|germania|spagna|francia|svizzera|america|olanda))\b.{0,150}\bchiavi\b/.test(
        t
      ) || /\b(spedisc\w*|invier\w*|mand\w*|spedir\w*) (le |la |ti le |ti la )?chiavi\b.{0,60}\b(corriere|posta|pacco|spedizione)\b/.test(t),
  },
  {
    livello: "attenzione",
    motivo: "una caparra o un anticipo da versare",
    vale: (t) =>
      /\bcaparra\b/.test(t) ||
      (/\b(anticipo|acconto)\b/.test(t) && CONTESTO_SOLDI.test(t)) ||
      /\b(bonific\w+)\b.{0,80}\b(caparra|anticipo|acconto|bloccare|prenotar\w+|riservar\w+)\b/.test(t) ||
      /\b(caparra|anticipo|acconto|bloccare|prenotare|riservare)\b.{0,80}\bbonific/.test(t),
  },
];

/**
 * Cosa c'è di rischioso in un messaggio. `nessuno` è la risposta normale:
 * parlare di un canone, di una visita o di un importo non è un rischio.
 */
export function rilevaRischioPagamento(testo: string | null | undefined): Rischio {
  if (typeof testo !== "string" || testo.trim() === "") return NESSUNO;
  // Si analizza tutto il messaggio. Oltre un limite enorme (che nessuna conversazione vera raggiunge)
  // si guardano l'inizio e la FINE: non l'inizio soltanto, altrimenti basterebbe far precedere un IBAN
  // da pagine di testo per non farlo vedere. Misurato: un milione di caratteri costa meno di 300 ms.
  if (testo.length > LIMITE_ANALISI) {
    testo = testo.slice(0, LIMITE_ANALISI / 2) + "\n" + testo.slice(-LIMITE_ANALISI / 2);
  }

  const t = deOfusca(normalizza(testo));
  const segnali: { livello: Segnale["livello"]; motivo: string }[] = [];

  if (contieneIban(testo)) segnali.push({ livello: "alto", motivo: MOTIVO_IBAN });
  for (const sg of SEGNALI) {
    if (sg.vale(t)) segnali.push({ livello: sg.livello, motivo: sg.motivo });
  }

  if (segnali.length === 0) return NESSUNO;
  const livello: LivelloRischio = segnali.some((s) => s.livello === "alto") ? "alto" : "attenzione";
  return { livello, segnali: segnali.map((s) => s.motivo) };
}

// ------------------------------------------------------------
// Cosa si dice
// ------------------------------------------------------------

/** Il consiglio breve, sempre visibile in cima a ogni chat. */
export const AVVISO_FISSO =
  "Non pagare mai caparre, anticipi o affitti prima di aver visto la casa e firmato un contratto.";

/** Come si riconosce una truffa: il testo dell'elenco che si apre dall'avviso fisso. */
export const SEGNI_DI_TRUFFA: readonly string[] = [
  "Ti chiedono soldi prima di farti vedere la casa.",
  "Parlano di caparra o anticipo da mandare con Postepay, ricarica, Western Union, criptovalute o buoni regalo.",
  "Dicono di essere all'estero e di spedirti le chiavi con un corriere.",
  "Il prezzo è molto più basso di quello di case simili nella stessa zona.",
  "Non vogliono parlare al telefono né incontrarti.",
];

export const CONSIGLIO_FINALE = "Se hai un dubbio, non pagare.";

function elenca(segnali: string[]): string {
  if (segnali.length <= 1) return segnali[0] ?? "";
  return segnali.slice(0, -1).join(", ") + " e " + segnali[segnali.length - 1];
}

/** Sotto un messaggio ricevuto che parla di soldi. */
export function testoAvvisoMessaggio(r: Rischio): string {
  if (r.livello === "nessuno") return "";
  const cosa = elenca(r.segnali);
  return r.livello === "alto"
    ? `Questo messaggio parla di ${cosa}. Non mandare soldi prima di aver visto la casa e firmato il contratto.`
    : `Questo messaggio parla di ${cosa}. Ricorda: niente pagamenti prima di aver visto la casa e firmato il contratto.`;
}

/** Prima di inviare un messaggio che parla di soldi. Non accusa: ricorda la regola. */
export function testoConfermaInvio(r: Rischio): string {
  if (r.livello === "nessuno") return "";
  return `Il messaggio che stai per inviare parla di ${elenca(r.segnali)}. Ricorda che nessun pagamento va fatto prima di aver visto la casa e firmato il contratto: chi lo chiede prima, di solito, sta tentando una truffa.`;
}
