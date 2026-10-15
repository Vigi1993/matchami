/**
 * Le richieste dei proprietari: un proprietario sceglie un inquilino che si è reso disponibile e gli manda una richiesta
 * («Fai match»). L'inquilino la trova in «I tuoi match»; se accetta nasce un match (con la chat), se rifiuta finisce lì.
 * Logica pura, senza database: si prova con `npm test`. Le regole vere (chi può scrivere a chi, il freno, il consenso) stanno
 * nel database (migrazione 0032) e qui si riflettono in parole.
 */

/** Quanto può essere lungo il messaggio facoltativo del proprietario (lo stesso limite del database). */
export const MESSAGGIO_RICHIESTA_MAX = 280;
/** Quante richieste al giorno può mandare un proprietario (lo stesso limite del database). */
export const RICHIESTE_AL_GIORNO = 20;

export type StatoRichiesta = "inviata" | "accettata" | "rifiutata";
const STATI: readonly string[] = ["inviata", "accettata", "rifiutata"];

export type CasaDellaRichiesta = {
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  foto: string | null;
};

/** Una richiesta com'è letta dall'inquilino. */
export type RichiestaPerInquilino = {
  id: string;
  stato: StatoRichiesta;
  messaggio: string | null;
  /** il nome di battesimo del proprietario */
  nomeProprietario: string | null;
  creataIl: string;
  /** la candidatura (la chat) nata dall'accettazione */
  candidaturaId: string | null;
  /** `null` se la casa non c'è più o non è più visibile */
  casa: CasaDellaRichiesta | null;
};

const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * Dalla riga del database (con la casa e le sue foto annidate) alla richiesta. Una riga rotta (senza identificativo o con uno
 * stato sconosciuto) dà `null` e non rompe la pagina.
 */
export function richiestaDaRiga(r: unknown): RichiestaPerInquilino | null {
  if (typeof r !== "object" || r === null) return null;
  const x = r as Record<string, unknown>;
  if (typeof x.id !== "string" || typeof x.stato !== "string" || !STATI.includes(x.stato)) return null;

  const l = (Array.isArray(x.listings) ? x.listings[0] : x.listings) as Record<string, unknown> | null | undefined;
  let casa: CasaDellaRichiesta | null = null;
  if (l && typeof l === "object" && typeof l.titolo === "string") {
    const foto = (Array.isArray(l.listing_photos) ? (l.listing_photos as Record<string, unknown>[]) : [])
      .filter((f) => f && typeof f.url === "string")
      .sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0))[0];
    casa = {
      titolo: l.titolo,
      zona: typeof l.zona === "string" ? l.zona : "",
      prezzo: typeof l.prezzo === "number" ? l.prezzo : 0,
      locali: typeof l.locali === "number" ? l.locali : null,
      mq: typeof l.mq === "number" ? l.mq : null,
      foto: foto ? (foto.url as string) : null,
    };
  }
  return {
    id: x.id,
    stato: x.stato as StatoRichiesta,
    messaggio: testo(x.messaggio),
    nomeProprietario: testo(x.nome_proprietario),
    creataIl: typeof x.created_at === "string" ? x.created_at : "",
    candidaturaId: typeof x.candidatura_id === "string" ? x.candidatura_id : null,
    casa,
  };
}

/** Le richieste a cui l'inquilino deve ancora rispondere, le più recenti per prime. */
export function richiesteInAttesa(lista: readonly RichiestaPerInquilino[]): RichiestaPerInquilino[] {
  return lista.filter((r) => r.stato === "inviata").sort((a, b) => (a.creataIl < b.creataIl ? 1 : a.creataIl > b.creataIl ? -1 : 0));
}

/** «Mario ha scelto il tuo profilo»; senza nome «Un proprietario». */
export function fraseRichiesta(r: Pick<RichiestaPerInquilino, "nomeProprietario">): string {
  return `${r.nomeProprietario ?? "Un proprietario"} ha scelto il tuo profilo`;
}

/** Le parole per ogni errore che il database può restituire: il codice sta all'inizio del messaggio. */
export const ERRORI_RICHIESTA: Readonly<Record<string, string>> = {
  NON_AUTENTICATO: "Accedi di nuovo per continuare.",
  NON_TUO_IMMOBILE: "Puoi scrivere solo per le tue case.",
  IMMOBILE_NON_PUBBLICATO: "La casa deve essere verificata e pubblicata.",
  INQUILINO_NON_DISPONIBILE: "Questa persona non è più disponibile.",
  GIA_CANDIDATO: "Questa persona si è già candidata alla tua casa: la trovi tra le candidature.",
  RICHIESTA_GIA_INVIATA: "Hai già scritto a questa persona per questa casa.",
  MESSAGGIO_TROPPO_LUNGO: `Il messaggio è troppo lungo: al massimo ${MESSAGGIO_RICHIESTA_MAX} caratteri.`,
  TROPPE_RICHIESTE: "Per oggi hai scritto ad abbastanza persone: riprova domani.",
  RICHIESTA_NON_TUA: "Non troviamo questa richiesta.",
  RICHIESTA_GIA_RISPOSTA: "Hai già risposto a questa richiesta.",
  IMMOBILE_NON_DISPONIBILE: "La casa non è più disponibile.",
  RISPOSTA_NON_VALIDA: "Rispondi sì o no.",
};

export const ERRORE_RICHIESTA_GENERICO = "Qualcosa non ha funzionato. Riprova tra poco.";

/** Dal messaggio del database («GIA_CANDIDATO: ...») alle parole per la persona; qualunque altra cosa resta generica. */
export function messaggioErroreRichiesta(messaggio: unknown): string {
  if (typeof messaggio !== "string") return ERRORE_RICHIESTA_GENERICO;
  const m = messaggio.match(/^([A-Z][A-Z_]+):/);
  return (m && ERRORI_RICHIESTA[m[1]]) || ERRORE_RICHIESTA_GENERICO;
}

/** Il messaggio facoltativo del proprietario: ripulito dagli spazi, vuoto = nessuno; `null` se è troppo lungo. */
export function messaggioPulito(m: unknown): { ok: true; valore: string | null } | { ok: false } {
  if (m === null || m === undefined) return { ok: true, valore: null };
  if (typeof m !== "string") return { ok: false };
  const v = m.trim();
  if (v.length > MESSAGGIO_RICHIESTA_MAX) return { ok: false };
  return { ok: true, valore: v === "" ? null : v };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const eUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
