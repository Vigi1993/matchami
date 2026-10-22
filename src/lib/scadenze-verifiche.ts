/**
 * Le SCADENZE delle verifiche (reddito e protesti) e la COPERTURA del reddito del nucleo. Una verifica è una fotografia a una data: dopo un po' non
 * dice più niente (un licenziamento, un nuovo protesto), quindi SCADE e va rinnovata; e se si dichiara un reddito del nucleo più alto di ciò che si
 * documenta, i punti sono proporzionali alla parte documentata. Logica pura, senza database né rete: si prova con `npm test`.
 *
 * Le regole vere stanno nel database (migrazione 0040): i valori di validità sono gli stessi e un test li tiene allineati. Qui si decide cosa
 * mostrare e cosa dire. Una regola importante: la scadenza si CALCOLA quando si legge il dato (non dipende da un lavoro periodico), così funziona
 * anche se lo scheduler non è configurato; il lavoro periodico serve solo per i promemoria.
 */

export type TipoVerifica = "reddito" | "protesti";
export type StatoVerificaGrezzo = "non_avviata" | "in_verifica" | "verificato";

/** Per quanti mesi vale una verifica dello staff. Sono ipotesi da confermare (documenti, prassi del settore, parere del legale): si cambiano qui e nella migrazione. */
export const VALIDITA_MESI: Record<TipoVerifica, number> = { reddito: 6, protesti: 3 };
/** Quanti giorni prima della scadenza si avvisa (e si può rinnovare): una prima volta e un promemoria. */
export const PREAVVISO_GIORNI = [30, 7] as const;
/** Ogni quanti giorni si chiede «la tua situazione non è cambiata?» (non sostituisce i documenti: intercetta il caso più comune). */
export const CONFERMA_OGNI_GIORNI = 90;
/** Quanto può mancare per considerare il reddito del nucleo «tutto documentato» (buste paga e importi dichiarati non coincidono al centesimo). */
export const TOLLERANZA_COPERTURA = 0.05;
/** Quanti percettori di reddito al massimo si documentano (limite del database). */
export const PERCETTORI_MASSIMI = 6;

const MS_GIORNO = 24 * 60 * 60 * 1000;

export type FaseVerifica = "non_avviata" | "in_verifica" | "valida" | "in_scadenza" | "scaduta";

export type StatoScadenza = {
  fase: FaseVerifica;
  /** dà punti e il badge «verificato» */
  valida: boolean;
  /** c'è un rinnovo in corso (documenti inviati, lo staff non ha ancora risposto) */
  rinnovoInCorso: boolean;
  /** giorni alla scadenza (0 = oggi); negativo se già scaduta; `null` se non c'è una scadenza */
  giorniResidui: number | null;
  scadeIl: string | null;
};

function leggiData(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * In che fase è una verifica. `scadeIl` è la scadenza della verifica già data dallo staff: `null` se non c'è (mai verificata, oppure invalidata perché
 * sono cambiati lavoro o reddito). Il rinnovo non toglie validità a quella vecchia: finché lo staff non risponde, vale la scadenza di prima.
 */
export function statoScadenza(input: { stato: StatoVerificaGrezzo; scadeIl: string | null | undefined; ora?: number }): StatoScadenza {
  const ora = input.ora ?? Date.now();
  const scade = leggiData(input.scadeIl);
  const rinnovoInCorso = input.stato === "in_verifica";
  if (scade === null) {
    return { fase: input.stato === "in_verifica" ? "in_verifica" : "non_avviata", valida: false, rinnovoInCorso: false, giorniResidui: null, scadeIl: null };
  }
  const giorni = Math.ceil((scade - ora) / MS_GIORNO);
  if (scade <= ora) return { fase: "scaduta", valida: false, rinnovoInCorso, giorniResidui: giorni, scadeIl: input.scadeIl ?? null };
  return { fase: giorni <= PREAVVISO_GIORNI[0] ? "in_scadenza" : "valida", valida: true, rinnovoInCorso, giorniResidui: giorni, scadeIl: input.scadeIl ?? null };
}

/**
 * Si può mandare un rinnovo quando la verifica sta per scadere o è scaduta (e non ce n'è già uno in corso). Se il reddito del nucleo è documentato solo
 * in parte si può mandare subito una nuova verifica, per AGGIUNGERE le prove degli altri: non si aspettano gli ultimi 30 giorni.
 */
export function puoRinnovare(s: StatoScadenza, opzioni?: { coperturaIncompleta?: boolean }): boolean {
  if (s.rinnovoInCorso) return false;
  if (s.fase === "in_scadenza" || s.fase === "scaduta") return true;
  return s.valida && opzioni?.coperturaIncompleta === true;
}

/**
 * La data in cui scade una verifica fatta in quel momento: più i mesi di validità, «a fine mese» come fa il database (31 agosto + 6 mesi = 28 febbraio,
 * non 3 marzo).
 */
export function scadenzaDa(dataVerifica: Date | string | number, tipo: TipoVerifica): Date {
  const d = new Date(dataVerifica);
  const mese = d.getUTCMonth() + VALIDITA_MESI[tipo];
  const anno = d.getUTCFullYear();
  const ultimoGiorno = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anno, mese, Math.min(d.getUTCDate(), ultimoGiorno), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

/** «12 ott 2026» (ora italiana); vuoto se la data non si legge. */
export function dataBreve(iso: string | null | undefined): string {
  const t = leggiData(iso);
  if (t === null) return "";
  return new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" }).replace(/\./g, "");
}

/** «ott 2026»: il mese in cui è stata fatta una verifica, quanto basta a un proprietario per sapere quanto è fresca. */
export function meseAnno(iso: string | null | undefined): string {
  const t = leggiData(iso);
  if (t === null) return "";
  return new Date(t).toLocaleDateString("it-IT", { month: "short", year: "numeric", timeZone: "Europe/Rome" }).replace(/\./g, "");
}

// ============================================================ la copertura del reddito del nucleo

/**
 * Quanta parte del reddito del nucleo dichiarato è documentata, da 0 a 1. Se la persona non dichiara un reddito del nucleo, vale quello personale.
 * Dal 95% in su conta come tutto (le cifre non coincidono mai al centesimo). Non supera mai 1: documentare più di ciò che si dichiara non dà di più.
 */
export function copertura(dichiarato: number | null | undefined, verificato: number | null | undefined): number {
  const v = typeof verificato === "number" && Number.isFinite(verificato) && verificato > 0 ? verificato : 0;
  const d = typeof dichiarato === "number" && Number.isFinite(dichiarato) && dichiarato > 0 ? dichiarato : 0;
  if (d === 0) return v > 0 ? 1 : 0;
  const r = v / d;
  return r >= 1 - TOLLERANZA_COPERTURA ? 1 : Math.max(0, r);
}

/** Il reddito che si confronta con i documenti: quello del nucleo se c'è, altrimenti quello personale. */
export function redditoDichiarato(redditoNucleo: number | null | undefined, redditoMensile: number | null | undefined): number | null {
  if (typeof redditoNucleo === "number" && redditoNucleo > 0) return redditoNucleo;
  if (typeof redditoMensile === "number" && redditoMensile > 0) return redditoMensile;
  return null;
}

/** I punti del reddito in proporzione a ciò che è documentato (arrotondati all'intero). */
export function puntiProporzionali(puntiPieni: number, cop: number): number {
  return Math.round(puntiPieni * Math.max(0, Math.min(1, cop)));
}

const euro = (n: number) => `€${Math.round(n).toLocaleString("it-IT")}`;

/** «€1.500 verificati su €3.000 dichiarati (50%)»; se è tutto documentato: «€3.000 verificati: tutto il reddito dichiarato». */
export function fraseCopertura(dichiarato: number | null, verificato: number | null): string {
  const d = dichiarato ?? 0;
  const v = verificato ?? 0;
  if (d <= 0) return v > 0 ? `${euro(v)} verificati` : "";
  const c = copertura(d, v);
  return c >= 1 ? `${euro(d)} verificati: tutto il reddito dichiarato` : `${euro(v)} verificati su ${euro(d)} dichiarati (${Math.round(c * 100)}%)`;
}

// ============================================================ un documento per ogni percettore

/** Quante persone del nucleo hanno un reddito, e quindi quante prove del reddito servono (da 1 a PERCETTORI_MASSIMI). */
export function percettoriDaDocumentare(redditiNucleo: number | null | undefined): number {
  const n = typeof redditiNucleo === "number" && Number.isFinite(redditiNucleo) ? Math.floor(redditiNucleo) : 1;
  return Math.max(1, Math.min(PERCETTORI_MASSIMI, n));
}

export type DocumentoRedditoPersona = { tipo: string; persona?: number | null };

/** Per chi manca ancora la prova del reddito (numero di persona, da 1). */
export function personeSenzaProva(documenti: readonly DocumentoRedditoPersona[], redditiNucleo: number | null | undefined): number[] {
  const hanno = new Set(documenti.filter((d) => d.tipo === "reddito").map((d) => d.persona ?? 1));
  const manca: number[] = [];
  for (let p = 1; p <= percettoriDaDocumentare(redditiNucleo); p++) if (!hanno.has(p)) manca.push(p);
  return manca;
}

/** «Carica la prova del reddito di Persona 2 (di 3)»: una frase per ogni persona che manca. */
export function frasiProveMancanti(documenti: readonly DocumentoRedditoPersona[], redditiNucleo: number | null | undefined): string[] {
  const tot = percettoriDaDocumentare(redditiNucleo);
  return personeSenzaProva(documenti, redditiNucleo).map((p) => (tot === 1 ? "Carica una prova del reddito" : p === 1 ? `Carica la prova del tuo reddito (persona 1 di ${tot})` : `Carica la prova del reddito della persona ${p} di ${tot}`));
}

/** Il nome di una persona del nucleo nelle schermate: «Tu» per la prima, «Persona 2»… per le altre. */
export function etichettaPersona(persona: number): string {
  return persona <= 1 ? "Tu" : `Persona ${persona}`;
}

// ============================================================ la conferma periodica

/** Da quando la verifica è «fresca»: l'ultima tra la verifica dello staff e la conferma della persona. */
export function ultimaFreschezza(verificataIl: string | null | undefined, confermataIl: string | null | undefined): string | null {
  const a = leggiData(verificataIl);
  const b = leggiData(confermataIl);
  const m = Math.max(a ?? -Infinity, b ?? -Infinity);
  return Number.isFinite(m) ? new Date(m).toISOString() : null;
}

export function giorniDa(iso: string | null | undefined, ora: number = Date.now()): number | null {
  const t = leggiData(iso);
  return t === null ? null : Math.floor((ora - t) / MS_GIORNO);
}

/** Si chiede «la tua situazione non è cambiata?» quando c'è una verifica valida ma l'ultima conferma è più vecchia di CONFERMA_OGNI_GIORNI. */
export function confermaNecessaria(input: { valida: boolean; verificataIl: string | null | undefined; confermataIl: string | null | undefined; ora?: number }): boolean {
  if (!input.valida) return false;
  const g = giorniDa(ultimaFreschezza(input.verificataIl, input.confermataIl), input.ora);
  return g !== null && g >= CONFERMA_OGNI_GIORNI;
}

// ============================================================ cosa dire

const TITOLO: Record<TipoVerifica, string> = { reddito: "reddito", protesti: "protesti" };

/** Cosa dire alla persona sulla validità della sua verifica (una frase). */
export function fraseValidita(tipo: TipoVerifica, s: StatoScadenza): string {
  const nome = TITOLO[tipo];
  if (s.fase === "valida") return `Valida fino al ${dataBreve(s.scadeIl)}.`;
  if (s.fase === "in_scadenza") return `Scade ${s.giorniResidui === 0 ? "oggi" : s.giorniResidui === 1 ? "domani" : `tra ${s.giorniResidui} giorni`} (${dataBreve(s.scadeIl)}): ${s.rinnovoInCorso ? "il rinnovo è in corso, finché non rispondiamo la verifica resta valida." : `rinnova la verifica dei ${nome === "reddito" ? "documenti del reddito" : "protesti"} per non perdere i punti.`}`;
  if (s.fase === "scaduta") return `Scaduta il ${dataBreve(s.scadeIl)}: non dà più punti e i proprietari non la vedono più come verificata. ${s.rinnovoInCorso ? "Il rinnovo è in corso." : "Rinnovala con documenti recenti."}`;
  return "";
}

/** Cosa legge un PROPRIETARIO accanto al reddito: la data della verifica, la parte documentata, o che la verifica è scaduta. */
export function etichettaRedditoProprietario(input: { valida: boolean; scaduta: boolean; verificatoIl: string | null | undefined; cop: number | null }): string | null {
  if (input.scaduta) return "Verifica del reddito scaduta";
  if (!input.valida) return null;
  const quando = meseAnno(input.verificatoIl);
  const parziale = input.cop !== null && input.cop < 1;
  return `${parziale ? `Reddito verificato in parte (${Math.round((input.cop ?? 0) * 100)}%)` : "Reddito verificato"}${quando ? ` · ${quando}` : ""}`;
}

export function etichettaProtestiProprietario(input: { esito: "nessuno" | "si" | null; scaduta: boolean; verificatoIl: string | null | undefined }): string | null {
  if (input.scaduta) return "Verifica dei protesti scaduta";
  if (!input.esito) return null;
  const quando = meseAnno(input.verificatoIl);
  return `${input.esito === "nessuno" ? "Nessun protesto · verificato" : "Ha protesti · verificato"}${quando ? ` · ${quando}` : ""}`;
}

// ============================================================ leggere le verifiche da una riga del database

/** I campi della riga dell'inquilino (tenant_profiles) che riguardano le verifiche. Tutto facoltativo: chi non li legge (dati vecchi) ottiene «non verificato». */
export type RigaVerificheInquilino = {
  verificato?: boolean | null;
  verifica_stato?: StatoVerificaGrezzo | null;
  reddito_scade_il?: string | null;
  reddito_verificato_at?: string | null;
  reddito_nucleo_verificato?: number | null;
  reddito_mensile?: number | null;
  reddito_nucleo?: number | null;
  protesti_verifica_stato?: StatoVerificaGrezzo | null;
  protesti_scade_il?: string | null;
  protesti_verificati_at?: string | null;
  situazione_confermata_at?: string | null;
};

/** I campi della vista che legge il proprietario (candidati_del_proprietario): lì la validità è già calcolata dal database. */
export type RigaVerificheVista = {
  verificato?: boolean | null;
  reddito_scaduto?: boolean | null;
  reddito_verificato_at?: string | null;
  reddito_nucleo_verificato?: number | null;
  reddito_mensile?: number | null;
  reddito_nucleo?: number | null;
  protesti_verificati?: boolean | null;
  protesti_scaduti?: boolean | null;
  protesti_verificati_at?: string | null;
  situazione_confermata_at?: string | null;
};

export type VerificheLette = {
  reddito: StatoScadenza | null;
  protesti: StatoScadenza | null;
  /** il reddito è verificato E la verifica vale ancora */
  redditoValido: boolean;
  /** c'era una verifica del reddito ma è scaduta */
  redditoScaduto: boolean;
  /** quanta parte del reddito del nucleo dichiarato è documentata, da 0 a 1; `null` se non c'è una verifica valida */
  coperturaReddito: number | null;
  redditoDichiarato: number | null;
  redditoNucleoVerificato: number | null;
  redditoVerificatoIl: string | null;
  protestiValidi: boolean;
  protestiScaduti: boolean;
  protestiVerificatiIl: string | null;
  /** l'ultima volta in cui la situazione è stata verificata o confermata */
  freschezza: string | null;
  confermataIl: string | null;
  /** va chiesto «la tua situazione non è cambiata?» */
  confermaNecessaria: boolean;
};

/**
 * La conferma «la tua situazione non è cambiata» riguarda LAVORO E REDDITO (la parte che può cambiare da un giorno all'altro): conta l'ultima tra la verifica
 * del reddito e la conferma, e solo se la verifica del reddito vale. I protesti non la rinfrescano.
 */
function componi(base: Omit<VerificheLette, "confermaNecessaria" | "freschezza">, verificataRedditoIl: string | null, confermataIl: string | null, ora: number | undefined): VerificheLette {
  const freschezza = ultimaFreschezza(verificataRedditoIl, confermataIl);
  return { ...base, freschezza, confermaNecessaria: confermaNecessaria({ valida: base.redditoValido, verificataIl: verificataRedditoIl, confermataIl, ora }) };
}

/** Le verifiche di un inquilino, dalla SUA riga (la vede lui, o lo staff, o il server): qui la validità si calcola dalle scadenze. */
export function leggiVerifiche(r: RigaVerificheInquilino, ora?: number): VerificheLette {
  const reddito = statoScadenza({ stato: r.verifica_stato ?? "non_avviata", scadeIl: r.verificato === true ? r.reddito_scade_il : null, ora });
  const protesti = statoScadenza({ stato: r.protesti_verifica_stato ?? "non_avviata", scadeIl: r.protesti_scade_il, ora });
  const dichiarato = redditoDichiarato(r.reddito_nucleo, r.reddito_mensile);
  // campo non fornito (dati vecchi, prove) = tutto documentato; fornito ma vuoto (`null`) = nessun importo scritto dallo staff
  const verificatoNucleo = r.reddito_nucleo_verificato === undefined ? (reddito.valida ? dichiarato : null) : r.reddito_nucleo_verificato;
  return componi(
    {
      reddito,
      protesti,
      redditoValido: reddito.valida,
      redditoScaduto: r.verificato === true && reddito.fase === "scaduta",
      coperturaReddito: reddito.valida ? copertura(dichiarato, verificatoNucleo) : null,
      redditoDichiarato: dichiarato,
      redditoNucleoVerificato: verificatoNucleo,
      redditoVerificatoIl: r.reddito_verificato_at ?? null,
      protestiValidi: protesti.valida,
      protestiScaduti: protesti.fase === "scaduta",
      protestiVerificatiIl: r.protesti_verificati_at ?? null,
      confermataIl: r.situazione_confermata_at ?? null,
    },
    r.reddito_verificato_at ?? null,
    r.situazione_confermata_at ?? null,
    ora
  );
}

/** Le verifiche di un candidato, dalla vista del PROPRIETARIO (che dice già se valgono ancora). Non ha le scadenze: non servono a lui. */
export function leggiVerificheVista(v: RigaVerificheVista | null | undefined): VerificheLette {
  const valido = v?.verificato === true;
  const dichiarato = redditoDichiarato(v?.reddito_nucleo, v?.reddito_mensile);
  const verificatoNucleo = v?.reddito_nucleo_verificato === undefined ? (valido ? dichiarato : null) : (v?.reddito_nucleo_verificato ?? null);
  return componi(
    {
      reddito: null,
      protesti: null,
      redditoValido: valido,
      redditoScaduto: v?.reddito_scaduto === true,
      coperturaReddito: valido ? copertura(dichiarato, verificatoNucleo) : null,
      redditoDichiarato: dichiarato,
      redditoNucleoVerificato: verificatoNucleo,
      redditoVerificatoIl: v?.reddito_verificato_at ?? null,
      protestiValidi: v?.protesti_verificati === true,
      protestiScaduti: v?.protesti_scaduti === true,
      protestiVerificatiIl: v?.protesti_verificati_at ?? null,
      confermataIl: v?.situazione_confermata_at ?? null,
    },
    v?.reddito_verificato_at ?? null,
    v?.situazione_confermata_at ?? null,
    undefined
  );
}

/** I tre campi dell'affidabilità che vengono dalle verifiche: il reddito conta solo se vale, in proporzione a ciò che è documentato; i protesti «verificati» solo se vale. */
export function parteVerificheAffidabilita(l: VerificheLette): { verificato: boolean; coperturaReddito: number; redditoScaduto: boolean; protestiVerificati: boolean } {
  return { verificato: l.redditoValido, coperturaReddito: l.coperturaReddito ?? 1, redditoScaduto: l.redditoScaduto, protestiVerificati: l.protestiValidi };
}
