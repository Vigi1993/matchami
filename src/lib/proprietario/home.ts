/**
 * La Home del proprietario: i dati di ogni casa e le frasi che li accompagnano. Logica pura (nessun accesso al database),
 * così si prova a fondo. Le frasi sono scritte per chi non è pratico: parole semplici, niente sigle né inglesismi.
 */
export type CasaHome = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  pubblicato: boolean;
  /** l'immobile è stato verificato dallo staff */
  verificata: boolean;
  /** l'indirizzo della prima foto, se c'è */
  foto: string | null;
  /** tutte le candidature ricevute per questa casa */
  nCandidature: number;
  /** quelle a cui non si è ancora risposto */
  daValutare: number;
  /** quanti inquilini cercano una casa come questa e non si sono candidati; `null` = non lo sappiamo (non si mostra) */
  possibili: number | null;
};

/** «Buongiorno», «Buon pomeriggio», «Buonasera» secondo l'ora italiana (0-23). Un'ora strana non rompe niente. */
export function salutoPerOra(ora: number): "Buongiorno" | "Buon pomeriggio" | "Buonasera" {
  const h = Number.isFinite(ora) ? ((Math.floor(ora) % 24) + 24) % 24 : 12;
  if (h >= 5 && h < 13) return "Buongiorno";
  if (h >= 13 && h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** «Buongiorno, Mario»; senza nome solo il saluto. */
export function saluto(nome: string | null | undefined, ora: number): string {
  const n = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  return n ? `${salutoPerOra(ora)}, ${n}` : salutoPerOra(ora);
}

/** L'ora in Italia adesso (0-23), qualunque sia il fuso del server. */
export function oraInItalia(adesso: Date = new Date()): number {
  const h = parseInt(adesso.toLocaleString("it-IT", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }), 10);
  return Number.isFinite(h) ? h % 24 : 12;
}

export type StatoCasa = { chiave: "pubblicata" | "in_verifica" | "non_pubblicata"; testo: string; spiegazione: string };

/** In che stato è la casa, in due parole e una frase: prima la verifica, poi la pubblicazione. */
export function statoCasa(c: Pick<CasaHome, "pubblicato" | "verificata">): StatoCasa {
  if (!c.verificata) return { chiave: "in_verifica", testo: "In verifica", spiegazione: "La stiamo controllando: gli inquilini la vedranno appena finito." };
  if (!c.pubblicato) return { chiave: "non_pubblicata", testo: "Non pubblicata", spiegazione: "Gli inquilini non la vedono ancora." };
  return { chiave: "pubblicata", testo: "Pubblicata", spiegazione: "Gli inquilini la vedono e possono candidarsi." };
}

/** Il numero da leggere, e la frase che lo segue, per i possibili inquilini. */
export function fraseCandidature(n: number): { numero: string; frase: string } {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return { numero: "0", frase: "Nessuno ha ancora chiesto di vedere la tua casa" };
  return { numero: String(k), frase: k === 1 ? "persona ha chiesto di vedere la tua casa" : "persone hanno chiesto di vedere la tua casa" };
}

export function frasePossibili(n: number): { numero: string; frase: string } {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return { numero: "0", frase: "Per ora nessun inquilino cerca una casa come la tua" };
  return { numero: String(k), frase: k === 1 ? "inquilino cerca una casa come la tua" : "inquilini cercano una casa come la tua" };
}

/** «Hai 1 candidatura da guardare» / «Hai 3 candidature da guardare»; `null` se non c'è niente da dire. */
export function inviteDaValutare(n: number): string | null {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return null;
  return k === 1 ? "Hai 1 candidatura da guardare" : `Hai ${k} candidature da guardare`;
}

export function testoPrezzo(prezzo: number): string {
  return `€ ${Math.round(Number.isFinite(prezzo) ? prezzo : 0).toLocaleString("it-IT")} al mese`;
}

/** «2 locali», «55 m²»: solo ciò che si sa. */
export function dettagliCasa(c: Pick<CasaHome, "locali" | "mq">): string[] {
  const r: string[] = [];
  if (typeof c.locali === "number" && c.locali > 0) r.push(c.locali === 1 ? "1 locale" : `${c.locali} locali`);
  if (typeof c.mq === "number" && c.mq > 0) r.push(`${c.mq} m²`);
  return r;
}

/** Dove porta ogni parte della Home. */
export const DESTINAZIONI_HOME = {
  immobili: "/immobili",
  candidature: "/database",
  possibili: "/database#possibili",
} as const;
