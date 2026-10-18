/**
 * L'elenco del Database inquilini del proprietario: UNA lista di persone (chi si è candidato e chi si può contattare) divisa per immobile, che si può
 * ordinare per AFFIDABILITÀ, MATCH o RECENSIONI, dal valore più alto o dal più basso, e filtrare. Logica pura, senza database né rete: si prova con
 * `npm test`.
 *
 * Le regole che contano:
 *  - il NUMERINO accanto al nome è il valore del criterio con cui si sta ordinando: `99%` per il match, `100` per l'affidabilità, `★ 4,5` per le
 *    recensioni, `—` se la persona non ha quel dato;
 *  - chi NON ha il dato (nessuna recensione, nessun criterio per il match) sta SEMPRE in fondo, qualunque sia il verso: ordinare dal più basso non
 *    deve far salire in cima chi semplicemente non ha niente da mostrare;
 *  - chi non soddisfa un criterio obbligatorio («bloccato») vale meno di qualunque percentuale, ma più di chi non ha il dato;
 *  - a parità di valore decide lo SPAREGGIO, sempre «il migliore prima» qualunque sia il verso: chi è «Inquilino raccomandato», poi gli altri due criteri
 *    (a parità di match: l'affidabilità, poi le recensioni), e in fondo l'ordine alfabetico, così l'ordine non balla da un disegno al successivo.
 * Niente di ciò che si cerca o si ordina viene salvato o inviato: resta in questa pagina.
 */
import { etichettaPunteggio } from "./affidabilita";
import { etichettaPer } from "./match/comuni";
import { datiSchedaCandidato, datiSchedaPossibile, type CasaDatabase, type DatiScheda, type GruppoAnnuncio } from "./database-proprietario";
import { FILTRI_VUOTI, corrisponde, normalizzaRicerca, paroleRicerca, type MinimoCompatibilita } from "./ricerca-candidati";
import type { RiepilogoRecensioni } from "./recensioni";
import type { SchedaInquilino } from "./proprietario/possibili-inquilini";
import type { CandidaturaRicevuta } from "./types";

// ============================================================ i criteri di ordinamento

export const CRITERI_ORDINE = ["affidabilita", "match", "recensioni"] as const;
export type CriterioOrdine = (typeof CRITERI_ORDINE)[number];
export const NOMI_CRITERI: Record<CriterioOrdine, string> = { affidabilita: "Affidabilità", match: "Match", recensioni: "Recensioni" };

export type VersoOrdine = "decrescente" | "crescente";
export const NOMI_VERSO: Record<VersoOrdine, string> = { decrescente: "dal più alto", crescente: "dal più basso" };
export type Ordine = { criterio: CriterioOrdine; verso: VersoOrdine };
/** Si parte dal match, dal più alto: è ciò che il proprietario guarda per primo. */
export const ORDINE_INIZIALE: Readonly<Ordine> = Object.freeze({ criterio: "match", verso: "decrescente" });

/**
 * Cosa succede toccando un criterio: se è già quello con cui si ordina si INVERTE il verso, altrimenti si passa a quel criterio tenendo il verso
 * (chi ordina «dal più basso» continua a vedere «dal più basso» anche cambiando criterio).
 */
export function scegliCriterio(ordine: Ordine, criterio: CriterioOrdine): Ordine {
  return criterio === ordine.criterio ? invertiVerso(ordine) : { criterio, verso: ordine.verso };
}
export function invertiVerso(ordine: Ordine): Ordine {
  return { criterio: ordine.criterio, verso: ordine.verso === "decrescente" ? "crescente" : "decrescente" };
}
/** Un valore che arriva da fuori (un modulo, un indirizzo) è un criterio valido? */
export function criterioValido(x: unknown): x is CriterioOrdine {
  return typeof x === "string" && (CRITERI_ORDINE as readonly string[]).includes(x);
}

// ============================================================ le persone

export type StatoVoce = "da_valutare" | "possibile" | "match" | "scartato" | "ritirato";
export const ETICHETTE_STATO_VOCE: Record<StatoVoce, string> = {
  da_valutare: "Da valutare",
  possibile: "Possibile match",
  match: "Match fatto",
  scartato: "Scartato",
  ritirato: "Ha ritirato",
};

/** Le schede in alto: «Tutti», «Da valutare», «Possibili», «Valutati» (match, scartati e chi ha ritirato). */
export const SCHEDE_ELENCO = ["tutti", "da_valutare", "possibili", "valutati"] as const;
export type SchedaElenco = (typeof SCHEDE_ELENCO)[number];
export const NOMI_SCHEDE: Record<SchedaElenco, string> = { tutti: "Tutti", da_valutare: "Da valutare", possibili: "Possibili", valutati: "Valutati" };

export function schedaDi(stato: StatoVoce): Exclude<SchedaElenco, "tutti"> {
  return stato === "da_valutare" ? "da_valutare" : stato === "possibile" ? "possibili" : "valutati";
}

export type VoceElenco = {
  /** unico in tutta la pagina: `c:<candidatura>` oppure `p:<casa>:<inquilino>` */
  chiave: string;
  casaId: string;
  stato: StatoVoce;
  scheda: DatiScheda;
  /** c'è se la persona si è candidata */
  candidatura: CandidaturaRicevuta | null;
  /** c'è se è una persona che si può contattare */
  possibile: SchedaInquilino | null;
};

/** Tutte le persone di tutti gli immobili, in una lista sola (l'ordine lo decide `ordinaVoci`). */
export function vociDaGruppi(gruppi: readonly GruppoAnnuncio[]): VoceElenco[] {
  const voci: VoceElenco[] = [];
  for (const g of gruppi) {
    const dalle = (lista: CandidaturaRicevuta[], stato: StatoVoce) => {
      for (const c of lista) voci.push({ chiave: `c:${c.id}`, casaId: g.casa.id, stato, scheda: datiSchedaCandidato(c), candidatura: c, possibile: null });
    };
    dalle(g.spontanei, "da_valutare");
    dalle(g.match, "match");
    dalle(g.scartati, "scartato");
    dalle(g.ritirati, "ritirato");
    for (const s of g.possibili?.disponibili ?? []) {
      voci.push({ chiave: `p:${g.casa.id}:${s.tenantId}`, casaId: g.casa.id, stato: "possibile", scheda: datiSchedaPossibile(s), candidatura: null, possibile: s });
    }
  }
  return voci;
}

// ============================================================ il valore di un criterio

/** Sotto qualsiasi percentuale (0 compreso), sopra chi non ha il dato. */
const VALORE_BLOCCATO = -1;

/** Il valore con cui si ordina; `null` = la persona non ha il dato (sta sempre in fondo). */
export function valoreCriterio(scheda: DatiScheda, criterio: CriterioOrdine): number | null {
  if (criterio === "affidabilita") return typeof scheda.affidabilita === "number" && Number.isFinite(scheda.affidabilita) ? scheda.affidabilita : null;
  if (criterio === "match") return scheda.match.tipo === "pct" ? scheda.match.valore : scheda.match.tipo === "bloccato" ? VALORE_BLOCCATO : null;
  // la media pesa sempre più del numero: un centesimo di media vale 1000, il numero di recensioni (fermato a 999) non lo raggiunge mai
  return haRecensioni(scheda.recensioni) ? Math.round(scheda.recensioni.media * 100) * 1000 + Math.min(scheda.recensioni.numero, 999) : null;
}

function haRecensioni(r: RiepilogoRecensioni | null): r is { numero: number; media: number } {
  return r !== null && r.numero > 0 && typeof r.media === "number" && Number.isFinite(r.media);
}

const ALTRI_CRITERI: Record<CriterioOrdine, readonly CriterioOrdine[]> = { match: ["affidabilita", "recensioni"], affidabilita: ["match", "recensioni"], recensioni: ["match", "affidabilita"] };

/** A parità di valore: prima chi è raccomandato, poi chi ha di più negli altri due criteri (chi non ha il dato, dopo). Sempre il migliore prima. */
function spareggio(a: DatiScheda, b: DatiScheda, criterio: CriterioOrdine): number {
  if (a.raccomandato !== b.raccomandato) return a.raccomandato ? -1 : 1;
  for (const c of ALTRI_CRITERI[criterio]) {
    const x = valoreCriterio(a, c);
    const y = valoreCriterio(b, c);
    if (x === y) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  }
  return 0;
}

/**
 * Le persone nell'ordine scelto. Chi non ha il dato va in fondo in ogni caso. Non modifica la lista che riceve.
 */
export function ordinaVoci<T extends { scheda: DatiScheda; chiave: string }>(voci: readonly T[], ordine: Ordine): T[] {
  const segno = ordine.verso === "decrescente" ? -1 : 1;
  return [...voci].sort((a, b) => {
    const x = valoreCriterio(a.scheda, ordine.criterio);
    const y = valoreCriterio(b.scheda, ordine.criterio);
    if (x === null && y === null) return spareggio(a.scheda, b.scheda, ordine.criterio) || a.scheda.nome.localeCompare(b.scheda.nome, "it") || a.chiave.localeCompare(b.chiave);
    if (x === null) return 1;
    if (y === null) return -1;
    return segno * (x - y) || spareggio(a.scheda, b.scheda, ordine.criterio) || a.scheda.nome.localeCompare(b.scheda.nome, "it") || a.chiave.localeCompare(b.chiave);
  });
}

const unDecimale = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Il numerino accanto al nome: «99%», «100», «★ 4,5», «No» (manca un requisito obbligatorio) oppure «—» (nessun dato). */
export function testoNumerino(scheda: DatiScheda, criterio: CriterioOrdine): string {
  if (criterio === "affidabilita") return typeof scheda.affidabilita === "number" ? String(scheda.affidabilita) : "—";
  if (criterio === "match") return scheda.match.tipo === "pct" ? `${scheda.match.valore}%` : scheda.match.tipo === "bloccato" ? "No" : "—";
  return haRecensioni(scheda.recensioni) ? `★ ${unDecimale(scheda.recensioni.media)}` : "—";
}

/** Le parole sotto la cifra nel riquadro del criterio: «Eccellente», «Ottima compatibilità», «2 recensioni». */
export function parolaCriterio(scheda: DatiScheda, criterio: CriterioOrdine): string {
  if (criterio === "affidabilita") return typeof scheda.affidabilita === "number" ? etichettaPunteggio(scheda.affidabilita) : "Non disponibile";
  if (criterio === "match") return scheda.match.tipo === "pct" ? etichettaPer(scheda.match.valore) : scheda.match.tipo === "bloccato" ? "Manca un requisito" : "Nessun criterio scelto";
  if (!haRecensioni(scheda.recensioni)) return "Nessuna ancora";
  return `${scheda.recensioni.numero} ${scheda.recensioni.numero === 1 ? "recensione" : "recensioni"}`;
}

/** La cifra dentro il cerchio del riquadro: «100», «99», «4,5», «No» (manca un requisito) o «–» (nessun dato). Senza il segno di percentuale: c'è già il nome. */
export function cifraCriterio(scheda: DatiScheda, criterio: CriterioOrdine): string {
  if (criterio === "affidabilita") return typeof scheda.affidabilita === "number" ? String(scheda.affidabilita) : "–";
  if (criterio === "match") return scheda.match.tipo === "pct" ? String(scheda.match.valore) : scheda.match.tipo === "bloccato" ? "No" : "–";
  return haRecensioni(scheda.recensioni) ? unDecimale(scheda.recensioni.media) : "–";
}

/** Quanto è piena la corona del criterio, da 0 a 100 (le recensioni su 5 stelle). */
export function pienezzaCriterio(scheda: DatiScheda, criterio: CriterioOrdine): number {
  if (criterio === "affidabilita") return typeof scheda.affidabilita === "number" ? Math.max(0, Math.min(100, scheda.affidabilita)) : 0;
  if (criterio === "match") return scheda.match.tipo === "pct" ? Math.max(0, Math.min(100, scheda.match.valore)) : 0;
  return haRecensioni(scheda.recensioni) ? Math.max(0, Math.min(100, (scheda.recensioni.media / 5) * 100)) : 0;
}

/** «Ordinati per Match · dal più alto.» */
export function frasaOrdine(ordine: Ordine): string {
  return `Ordinati per ${NOMI_CRITERI[ordine.criterio]} · ${NOMI_VERSO[ordine.verso]}.`;
}

// ============================================================ ricerca e filtri

export type FiltriElenco = {
  scheda: SchedaElenco;
  testo: string;
  soloVerificati: boolean;
  soloRaccomandati: boolean;
  senzaBlocchi: boolean;
  minimo: MinimoCompatibilita;
};
export const FILTRI_ELENCO_VUOTI: Readonly<FiltriElenco> = Object.freeze({ scheda: "tutti", testo: "", soloVerificati: false, soloRaccomandati: false, senzaBlocchi: false, minimo: 0 });

/** I filtri oltre alla ricerca e alle schede: reddito verificato, raccomandati, senza blocchi, compatibilità minima. */
export function numeroFiltriAvanzati(f: FiltriElenco): number {
  return (f.soloVerificati ? 1 : 0) + (f.soloRaccomandati ? 1 : 0) + (f.senzaBlocchi ? 1 : 0) + (f.minimo > 0 ? 1 : 0);
}
export function ceFiltriAttivi(f: FiltriElenco): boolean {
  return f.scheda !== "tutti" || normalizzaRicerca(f.testo) !== "" || numeroFiltriAvanzati(f) > 0;
}

/** Una persona rispetta ricerca e filtri avanzati? (Le schede in alto si applicano a parte.) */
export function corrispondeVoce(v: VoceElenco, f: FiltriElenco, casa: Pick<CasaDatabase, "titolo" | "zona">): boolean {
  if (v.candidatura) {
    // chi si è candidato: le stesse regole di sempre
    return corrisponde(v.candidatura, { ...FILTRI_VUOTI, testo: f.testo, soloVerificati: f.soloVerificati, soloRaccomandati: f.soloRaccomandati, senzaBlocchi: f.senzaBlocchi, minimo: f.minimo }, () => "in_attesa");
  }
  const s = v.scheda;
  if (f.soloVerificati && !s.redditoVerificato) return false;
  if (f.soloRaccomandati && !s.raccomandato) return false;
  if (f.minimo > 0 && (s.match.tipo !== "pct" || s.match.valore < f.minimo)) return false;
  const parole = paroleRicerca(f.testo);
  if (parole.length > 0) {
    const testo = normalizzaRicerca([s.nome, s.professione, casa.titolo, casa.zona].filter((x): x is string => typeof x === "string").join(" "));
    if (!parole.every((p) => testo.includes(p))) return false;
  }
  return true;
}

/** Le persone che rispettano ricerca e filtri avanzati, senza guardare la scheda scelta (serve a contare le persone di ogni scheda). */
export function vociFiltrate(voci: readonly VoceElenco[], f: FiltriElenco, casePer: ReadonlyMap<string, Pick<CasaDatabase, "titolo" | "zona">>): VoceElenco[] {
  return voci.filter((v) => corrispondeVoce(v, f, casePer.get(v.casaId) ?? { titolo: "", zona: "" }));
}

/** Quante persone ci sono in ogni scheda. */
export function conteggiSchede(voci: readonly VoceElenco[]): Record<SchedaElenco, number> {
  const c: Record<SchedaElenco, number> = { tutti: voci.length, da_valutare: 0, possibili: 0, valutati: 0 };
  for (const v of voci) c[schedaDi(v.stato)]++;
  return c;
}

// ============================================================ i box degli immobili

export type BoxImmobile = {
  gruppo: GruppoAnnuncio;
  /** le persone che si vedono adesso (dopo ricerca, filtri e scheda), nell'ordine scelto */
  voci: VoceElenco[];
  /** le parole sotto il titolo quando il box è chiuso: «2 da valutare · 3 possibili» */
  riepilogo: string;
  /** quante persone ha l'immobile in tutto, senza filtri */
  totale: number;
};

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

/** «2 da valutare · 3 possibili · 1 match», solo le parti con qualcuno. Senza nessuno: «Nessuno ancora». */
export function riepilogoImmobile(voci: readonly Pick<VoceElenco, "stato">[]): string {
  const n: Record<StatoVoce, number> = { da_valutare: 0, possibile: 0, match: 0, scartato: 0, ritirato: 0 };
  for (const v of voci) n[v.stato]++;
  const parti = [
    n.da_valutare > 0 ? `${n.da_valutare} da valutare` : "",
    n.possibile > 0 ? plurale(n.possibile, "possibile", "possibili") : "",
    n.match > 0 ? `${n.match} match` : "",
    n.scartato > 0 ? plurale(n.scartato, "scartato", "scartati") : "",
    n.ritirato > 0 ? plurale(n.ritirato, "ritirato", "ritirati") : "",
  ].filter(Boolean);
  return parti.length > 0 ? parti.join(" · ") : "Nessuno ancora";
}

/**
 * I box, uno per immobile e nello stesso ordine dei gruppi, con le persone da mostrare. Un immobile senza nessuna persona che corrisponda sparisce
 * quando c'è una ricerca o un filtro acceso; senza filtri resta anche vuoto (per dire che nessuno si è ancora fatto avanti).
 */
export function costruisciBox(input: { gruppi: readonly GruppoAnnuncio[]; voci: readonly VoceElenco[]; filtri: FiltriElenco; ordine: Ordine }): BoxImmobile[] {
  const casePer = new Map(input.gruppi.map((g) => [g.casa.id, g.casa] as const));
  const dopoFiltri = vociFiltrate(input.voci, input.filtri, casePer);
  const visibili = input.filtri.scheda === "tutti" ? dopoFiltri : dopoFiltri.filter((v) => schedaDi(v.stato) === input.filtri.scheda);
  const filtrando = ceFiltriAttivi(input.filtri);
  const out: BoxImmobile[] = [];
  for (const g of input.gruppi) {
    const sue = ordinaVoci(visibili.filter((v) => v.casaId === g.casa.id), input.ordine);
    if (sue.length === 0 && filtrando) continue;
    const tutte = input.voci.filter((v) => v.casaId === g.casa.id);
    out.push({ gruppo: g, voci: sue, riepilogo: riepilogoImmobile(sue), totale: tutte.length });
  }
  return out;
}

/** Quale persona mostrare nel dettaglio: quella scelta se si vede ancora, altrimenti la prima della lista; `null` se non c'è nessuno. */
export function vocePerDettaglio(box: readonly BoxImmobile[], chiave: string | null): VoceElenco | null {
  const tutte = box.flatMap((b) => b.voci);
  return tutte.find((v) => v.chiave === chiave) ?? tutte[0] ?? null;
}

/** Le persone da mostrare come miniature quando un immobile è chiuso: le prime tre, e quante sono le altre. */
export function miniature(voci: readonly VoceElenco[], quante = 3): { prime: VoceElenco[]; altre: number } {
  return { prime: voci.slice(0, quante), altre: Math.max(0, voci.length - quante) };
}

/** «3 immobili» / «1 immobile». */
export function testoImmobili(n: number): string {
  return plurale(n, "immobile", "immobili");
}
