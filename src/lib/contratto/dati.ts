/**
 * Dai dati del database ai dati del contratto: pulizia e formattazione. Logica pura.
 * Ciò che manca resta `null` e il modello lo scrive «[da indicare]»: un dato che non
 * abbiamo non si inventa mai, in un documento che le parti potrebbero firmare.
 */
import type { DatiContratto, RigaContratto } from "./tipi";

export const DA_INDICARE = "[da indicare]";

/** Spazi ridotti a uno, ai lati niente, e nessun carattere di controllo. */
export function pulisciTesto(x: unknown): string {
  if (typeof x !== "string") return "";
  return x.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, " ").replace(/\s+/g, " ").trim();
}

/** «Nome Cognome», o `null` se mancano entrambi. */
export function nomeCompleto(nome: unknown, cognome: unknown): string | null {
  const s = [pulisciTesto(nome), pulisciTesto(cognome)].filter(Boolean).join(" ");
  return s === "" ? null : s;
}

const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** «2026-11-01» → «1 novembre 2026». Una data che non esiste (30 febbraio) o non scritta così vale `null`. */
export function formattaDataIso(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [a, me, g] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, me - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
  return FORMATO_DATA.format(d);
}

/** Un numero intero positivo, o `null`. */
export function interoPositivo(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null;
}

function numeroOnull(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

/**
 * Quanto può essere lungo ciascun testo. Un nome o un titolo di migliaia di caratteri non è un dato
 * vero ed è un modo per rallentare la generazione del documento a chi lo scarica (il titolo di un
 * annuncio lo scrive il proprietario, il PDF lo genera l'inquilino). Si abbrevia, e il documento lo dice.
 */
export const LIMITI_TESTO = { nome: 100, cognome: 100, titolo: 200, zona: 100, via: 150, civico: 20, cap: 10, citta: 80, classe: 10 } as const;

/** Il testo, pulito e tagliato a `max` caratteri (con «…» in fondo se si è tagliato). */
export function limita(x: unknown, max: number): { testo: string; troncato: boolean } {
  const t = pulisciTesto(x);
  const caratteri = [...t]; // per punti di codice: non si taglia un carattere a metà
  return caratteri.length > max ? { testo: caratteri.slice(0, max - 1).join("") + "…", troncato: true } : { testo: t, troncato: false };
}

/** Da una riga del database ai dati del contratto; `null` se la riga non è un contratto. */
export function datiDaRiga(r: Partial<RigaContratto> | null | undefined): DatiContratto | null {
  if (!r || typeof r.contratto_id !== "string" || r.contratto_id === "") return null;

  let troncato = false;
  const l = (x: unknown, max: number): string => { const o = limita(x, max); if (o.troncato) troncato = true; return o.testo; };

  const via = l(r.via, LIMITI_TESTO.via);
  const civico = l(r.civico, LIMITI_TESTO.civico);
  const cap = l(r.cap, LIMITI_TESTO.cap);
  const citta = l(r.citta, LIMITI_TESTO.citta);
  const locatoreNome = l(r.locatore_nome, LIMITI_TESTO.nome);
  const locatoreCognome = l(r.locatore_cognome, LIMITI_TESTO.cognome);
  const conduttoreNome = l(r.conduttore_nome, LIMITI_TESTO.nome);
  const conduttoreCognome = l(r.conduttore_cognome, LIMITI_TESTO.cognome);
  const titolo = l(r.titolo, LIMITI_TESTO.titolo);
  const zona = l(r.zona, LIMITI_TESTO.zona);
  const classe = l(r.classe_energetica, LIMITI_TESTO.classe);

  return {
    id: r.contratto_id,
    stato: pulisciTesto(r.stato),
    locatore: { nome: locatoreNome || null, cognome: locatoreCognome || null },
    conduttore: { nome: conduttoreNome || null, cognome: conduttoreCognome || null },
    immobile: {
      titolo: titolo || null,
      zona: zona || null,
      locali: interoPositivo(r.locali),
      mq: interoPositivo(r.mq),
      classeEnergetica: classe || null,
      epGlobale: numeroOnull(r.ep_globale),
      // l'indirizzo si usa solo se c'è tutto: un pezzo di indirizzo in un contratto è peggio di nessuno
      indirizzo: via && civico && cap && citta ? { via, civico, cap, citta } : null,
    },
    canone: interoPositivo(r.canone),
    durataMesi: interoPositivo(r.durata_mesi),
    dataInizio: typeof r.data_inizio === "string" && formattaDataIso(r.data_inizio) ? r.data_inizio : null,
    dataFirma: typeof r.data_firma === "string" && formattaDataIso(r.data_firma) ? r.data_firma : null,
    ioSono: r.io_sono === "locatore" ? "locatore" : "conduttore",
    troncato,
  };
}
