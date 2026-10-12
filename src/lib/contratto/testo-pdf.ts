/**
 * Preparare un testo per un PDF con i font standard (Helvetica): pulizia dei caratteri e a capo.
 * Logica pura, senza librerie: si prova con `npm test`.
 *
 * I font standard di un PDF conoscono solo i caratteri di Windows-1252 (le lettere accentate
 * italiane, l'euro, le virgolette, il trattino lungo, ma non per esempio il polacco «Ł», il
 * cirillico o gli emoji). Un carattere che il font non ha FA FALLIRE la scrittura: i nomi
 * delle persone arrivano da fuori, quindi qualunque testo va reso scrivibile prima.
 */

/** I caratteri oltre Latin-1 che Windows-1252 ha nella fascia 0x80–0x9F. */
const EXTRA_CP1252 = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Il carattere esiste in Windows-1252? (spazio compreso; i caratteri di controllo no) */
export function inCp1252(c: number): boolean {
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA_CP1252.has(c);
}

/** Sostituzioni leggibili per caratteri simili che il font non ha. */
const SOSTITUZIONI: Record<string, string> = {
  "\u2212": "-", // segno meno
  "\u2010": "-", "\u2011": "-", "\u2012": "-", // trattini
  "\u2192": "->", "\u2190": "<-",
  "\u00ad": "", // trattino morbido
  "\u0141": "L", "\u0142": "l", // Ł ł
  "\u0110": "D", "\u0111": "d", // Đ đ
  // gli apici: nel font standard esistono, ma alcuni visualizzatori non li disegnano («55 m ») e
  // in un documento che indica la superficie sarebbe un difetto vero: meglio la cifra semplice
  "\u00b2": "2", "\u00b3": "3", "\u00b9": "1",
};

/**
 * Rende scrivibile un testo: toglie i caratteri di controllo e invisibili, sostituisce quelli
 * simili, toglie gli accenti a ciò che il font non ha (così «Ł» diventa «L»), e per il resto
 * scrive «?». Mai un errore, e mai un carattere che il font non conosca.
 */
export function sanitizzaPerPdf(testo: unknown): string {
  if (typeof testo !== "string") return "";
  let fuori = "";
  for (const ch of testo.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c === 0x0a || c === 0x0d || c === 0x09) { fuori += " "; continue; }
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff) continue;
    if (c === 0xa0) { fuori += " "; continue; } // lo spazio che non va a capo: un semplice spazio
    if (Object.prototype.hasOwnProperty.call(SOSTITUZIONI, ch)) { fuori += SOSTITUZIONI[ch]; continue; }
    if (inCp1252(c)) { fuori += ch; continue; }
    // senza accento: «ā» -> «a». Se nemmeno la base c'è, un punto interrogativo.
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    fuori += [...base].every((x) => inCp1252(x.codePointAt(0)!)) && base !== "" ? base : "?";
  }
  return fuori;
}

export type Misura = (testo: string, grandezza: number, grassetto: boolean) => number;

/**
 * Una riga non contiene mai più di tanti caratteri: nemmeno la lettera più stretta, in un corpo
 * leggibile, ne farebbe stare di più su una pagina A4. Serve a non misurare mai più di così in
 * una volta, e quindi a non rallentare con un testo enorme.
 */
export const MASSIMO_CARATTERI_PER_RIGA = 400;

/**
 * Spezza un testo in righe che stiano in `larghezza`. Va a capo tra le parole; una parola più
 * lunga di una riga (un indirizzo, un nome senza spazi) si spezza dove serve, invece di uscire
 * dalla pagina. Il tempo cresce con la lunghezza del testo, non con il suo quadrato: il taglio di
 * una parola lunga si cerca con una ricerca binaria su un tratto limitato. Mai una riga vuota in
 * mezzo, mai un ciclo infinito.
 */
export function spezzaInRighe(testo: string, larghezza: number, grandezza: number, grassetto: boolean, misura: Misura): string[] {
  const parole = sanitizzaPerPdf(testo).split(" ").filter((p) => p !== "");
  const righe: string[] = [];
  let corrente = "";

  const sta = (t: string) => t.length <= MASSIMO_CARATTERI_PER_RIGA && misura(t, grandezza, grassetto) <= larghezza;

  for (const parola of parole) {
    let resto = parola;
    // una parola troppo lunga si spezza in pezzi che ci stiano
    while (!sta(resto)) {
      // il pezzo più lungo che sta in una riga: la larghezza cresce con la lunghezza, quindi si cerca a metà
      let basso = 1;
      let alto = Math.min(resto.length - 1, MASSIMO_CARATTERI_PER_RIGA);
      let n = 1; // anche una sola lettera, se nemmeno quella ci sta: si va avanti comunque
      while (basso <= alto) {
        const meta = (basso + alto) >> 1;
        if (sta(resto.slice(0, meta))) { n = meta; basso = meta + 1; } else alto = meta - 1;
      }
      if (corrente) { righe.push(corrente); corrente = ""; }
      righe.push(resto.slice(0, n));
      resto = resto.slice(n);
      if (resto === "") break;
    }
    if (resto === "") continue;

    const prova = corrente ? `${corrente} ${resto}` : resto;
    if (sta(prova)) corrente = prova;
    else { righe.push(corrente); corrente = resto; }
  }
  if (corrente) righe.push(corrente);
  return righe;
}

export const AVVISO_CARATTERI_SEMPLIFICATI =
  "Alcuni caratteri dei nomi (per esempio certe lettere polacche o turche) non esistono nel carattere usato dal PDF e sono stati semplificati: controlla i nomi.";

/**
 * Il testo, una volta reso scrivibile, è diverso da com'era (a parte spazi e a capo)? Vuol dire
 * che un carattere è stato semplificato o sostituito: un nome come «Łukasz» diventa «Lukasz».
 */
export function perdeCaratteri(testo: unknown): boolean {
  if (typeof testo !== "string") return false;
  const originale = testo.normalize("NFC").replace(/[\s\u00a0]+/g, " ").trim();
  // i caratteri di controllo e invisibili che sanitizzaPerPdf toglie non sono una perdita
  const pulito = originale.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff\u00ad]/g, "");
  return sanitizzaPerPdf(pulito).replace(/ +/g, " ").trim() !== pulito;
}

/** Il documento contiene un testo che il PDF non riesce a scrivere così com'è? */
export function documentoSemplificato(doc: { titolo: string; avvisi: string[]; sezioni: { titolo: string; paragrafi: string[] }[]; firme: { ruolo: string; nome: string | null }[] }): boolean {
  const testi = [doc.titolo, ...doc.avvisi, ...doc.sezioni.flatMap((s) => [s.titolo, ...s.paragrafi]), ...doc.firme.flatMap((f) => [f.ruolo, f.nome ?? ""])];
  return testi.some(perdeCaratteri);
}
