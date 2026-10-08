/**
 * Preferiti e scarti degli annunci, dal lato dell'inquilino: la storia delle
 * scelte fatte nel mazzo (su cui si regge «annulla»), l'elenco degli annunci da
 * non rimettere nel mazzo, e i testi. Logica pura, senza database: si prova con
 * `npm test`.
 *
 * Le regole vere (chi può scegliere, il tetto di 100 preferiti, i 30 giorni
 * dello scarto, la pulizia) stanno nelle funzioni del database (migrazione
 * 0023).
 */

/** Per quanti giorni si ricorda uno scarto; poi l'annuncio può riapparire. */
export const GIORNI_SCARTO = 30;

/** Quanti annunci si possono salvare. */
export const MASSIMO_PREFERITI = 100;

/** Quante scelte si tengono in memoria per «annulla»: oltre, le più vecchie si dimenticano. */
export const MASSIMO_STORIA = 50;

export type TipoScelta = "scartato" | "preferito";

/** Una scelta fatta nel mazzo, nell'ordine in cui è stata fatta. */
export type Scelta = { listingId: string; tipo: TipoScelta };

/**
 * Aggiunge una scelta alla storia. Una candidatura NON è una scelta annullabile
 * (si ritira da «Candidature»): dopo averne inviata una, `svuota` riparte da
 * zero, perché tornare indietro oltre quel punto riporterebbe sotto gli occhi
 * un annuncio a cui ci si è già candidati.
 */
export function registra(storia: Scelta[], scelta: Scelta): Scelta[] {
  const nuova = [...storia, scelta];
  return nuova.length > MASSIMO_STORIA ? nuova.slice(nuova.length - MASSIMO_STORIA) : nuova;
}

/** La storia dopo una candidatura: non si torna indietro oltre quel punto. */
export function svuota(): Scelta[] {
  return [];
}

/** L'ultima scelta, se c'è: è quella che «annulla» toglie. */
export function ultimaScelta(storia: Scelta[]): Scelta | null {
  return storia.length > 0 ? storia[storia.length - 1] : null;
}

/** La storia senza l'ultima scelta, e quale era. Una storia vuota resta com'è. */
export function annullaUltima(storia: Scelta[]): { storia: Scelta[]; annullata: Scelta | null } {
  if (storia.length === 0) return { storia, annullata: null };
  return { storia: storia.slice(0, -1), annullata: storia[storia.length - 1] };
}

/**
 * Gli identificativi che `annunci_nascosti` restituisce. PostgREST dà un elenco
 * di valori semplici per una funzione che restituisce un insieme di uuid, ma
 * qualche versione li incapsula in un oggetto: si accettano tutte e due le
 * forme, e si scarta ciò che non è un identificativo.
 */
export function idsNascosti(dati: unknown): string[] {
  if (!Array.isArray(dati)) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids: string[] = [];
  for (const x of dati) {
    const v = typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>)[0] : null;
    if (typeof v === "string" && uuid.test(v)) ids.push(v);
  }
  return [...new Set(ids)];
}

// ------------------------------------------------------------
// Testi
// ------------------------------------------------------------

export const TESTO_SALVATO = "Salvato nei preferiti — lo trovi in Profilo → Preferiti.";
export const TESTO_PREFERITO_TOLTO = "Tolto dai preferiti.";
export const TESTO_SCARTO_ANNULLATO = "Scarto annullato.";

/** Cosa si dice quando il mazzo è finito: dove sono finiti gli annunci scartati e quelli salvati. */
export const TESTO_DOVE_SONO = `Gli annunci che scarti tornano a comparire dopo ${GIORNI_SCARTO} giorni; quelli che salvi li trovi in Profilo → Preferiti.`;

/** La riga del Profilo. */
export function sottotitoloPreferiti(n: number): string {
  const x = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (x === 0) return "Salva gli annunci che ti interessano, per scegliere con calma";
  return x === 1 ? "1 annuncio salvato" : `${x} annunci salvati`;
}

export const TESTO_NESSUN_PREFERITO =
  "Dal mazzo, tocca il segnalibro per salvare un annuncio che ti interessa senza candidarti subito.";

export const TESTO_NOTA_PREFERITI = `I preferiti restano finché li togli. Gli annunci che scarti tornano a comparire dopo ${GIORNI_SCARTO} giorni.`;

/** Il titolo della schermata quando tutti gli annunci disponibili sono già stati scelti. */
export const TITOLO_TUTTI_SCELTI = "Hai già scelto tutti gli annunci disponibili";

/** Una riga di `elenco_preferiti`. */
export type Preferito = {
  listing_id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  foto: string | null;
  salvato_at: string;
};

/** «€1.500/mese · 2 locali · 55 m²», senza ciò che manca. */
export function descrizionePreferito(p: Pick<Preferito, "prezzo" | "locali" | "mq">): string {
  const parti: string[] = [];
  if (typeof p.prezzo === "number" && Number.isFinite(p.prezzo)) parti.push(`€${p.prezzo.toLocaleString("it-IT")}/mese`);
  if (typeof p.locali === "number" && p.locali > 0) parti.push(p.locali === 1 ? "1 locale" : `${p.locali} locali`);
  if (typeof p.mq === "number" && p.mq > 0) parti.push(`${p.mq} m²`);
  return parti.join(" · ");
}

export const TESTO_CANDIDATURA_INVIATA = "Candidatura inviata — la trovi in Candidature.";
