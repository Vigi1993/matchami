/**
 * I luoghi: provincia → città → quartiere. Logica pura, senza rete: l'elenco arriva dal database (poche decine di righe,
 * si carica una volta e si filtra qui, così il completamento automatico è immediato).
 */

export type LivelloLuogo = "provincia" | "comune" | "quartiere";

export type Luogo = {
  id: string;
  livello: LivelloLuogo;
  nome: string;
  /** solo per le province: «MI», «BG» */
  sigla: string | null;
  parent_id: string | null;
};

export type MappaLuoghi = ReadonlyMap<string, Luogo>;

export const MAX_LUOGHI_SCELTI = 20;

export function mappaLuoghi(luoghi: readonly Luogo[] | null | undefined): Map<string, Luogo> {
  const m = new Map<string, Luogo>();
  for (const l of luoghi ?? []) if (l && typeof l.id === "string") m.set(l.id, l);
  return m;
}

/** Il luogo e tutti quelli che lo contengono, dal più piccolo al più grande. Non si ferma in un giro (dati rotti). */
export function antenati(id: string | null | undefined, mappa: MappaLuoghi): string[] {
  const fuori: string[] = [];
  let corrente = id ?? null;
  while (corrente !== null && mappa.has(corrente) && !fuori.includes(corrente)) {
    fuori.push(corrente);
    corrente = mappa.get(corrente)!.parent_id;
  }
  return fuori;
}

/** «Isola, Milano» per un quartiere, «Milano» per una città, «Provincia di Milano» per una provincia. */
export function etichettaLuogo(l: Luogo, mappa: MappaLuoghi): string {
  if (l.livello === "provincia") return `Provincia di ${l.nome}`;
  if (l.livello === "comune") return l.nome;
  const comune = l.parent_id ? mappa.get(l.parent_id) : undefined;
  return comune ? `${l.nome}, ${comune.nome}` : l.nome;
}

/** Il percorso per i suggerimenti: «Isola · Milano · MI». */
export function percorsoLuogo(l: Luogo, mappa: MappaLuoghi): string {
  const nomi: string[] = [];
  for (const id of antenati(l.id, mappa)) {
    const x = mappa.get(id)!;
    nomi.push(x.livello === "provincia" ? (x.sigla ?? x.nome) : x.nome);
  }
  return nomi.join(" · ");
}

/** Minuscolo, senza accenti né segni, spazi ridotti: «Città   Alta» e «citta alta» sono la stessa cosa. */
export function normalizza(testo: unknown): string {
  if (typeof testo !== "string") return "";
  return testo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SuggerimentoLuogo = { luogo: Luogo; etichetta: string; percorso: string; punti: number };

const ORDINE_LIVELLO: Record<LivelloLuogo, number> = { comune: 0, provincia: 1, quartiere: 2 };

/**
 * Il completamento automatico. Ogni parola scritta deve cominciare una parola del nome, o del nome della città o della
 * provincia che lo contiene (o essere la sigla della provincia): «isola mil» trova «Isola, Milano». Prima i nomi che
 * cominciano come scritto, poi le città, poi i quartieri. Mai errori, qualunque cosa si scriva.
 */
export function cercaLuoghi(
  testo: unknown,
  luoghi: readonly Luogo[] | null | undefined,
  opzioni: { max?: number; esclusi?: readonly string[]; livelli?: readonly LivelloLuogo[] } = {}
): SuggerimentoLuogo[] {
  const parole = normalizza(testo).split(" ").filter(Boolean);
  if (parole.length === 0) return [];
  const mappa = mappaLuoghi(luoghi);
  const esclusi = new Set(opzioni.esclusi ?? []);
  const livelli = opzioni.livelli ? new Set<LivelloLuogo>(opzioni.livelli) : null;
  const max = Math.max(1, Math.min(20, opzioni.max ?? 8));
  const trovati: SuggerimentoLuogo[] = [];

  for (const l of mappa.values()) {
    if (esclusi.has(l.id)) continue;
    if (livelli && !livelli.has(l.livello)) continue;
    const nome = normalizza(l.nome);
    const contesto = antenati(l.id, mappa)
      .slice(1)
      .flatMap((id) => {
        const a = mappa.get(id)!;
        return [normalizza(a.nome), a.sigla ? normalizza(a.sigla) : ""];
      })
      .filter(Boolean);
    const paroleNome = nome.split(" ");
    const paroleContesto = contesto.flatMap((c) => c.split(" "));
    if (l.sigla) paroleContesto.push(normalizza(l.sigla));

    let punti = 0;
    let tutte = true;
    const sigla = l.sigla ? normalizza(l.sigla) : "";
    for (const p of parole) {
      if (sigla !== "" && sigla === p) punti += 6; // la sigla trova la provincia, non le città che contiene
      else if (nome === p) punti += 6;
      else if (nome.startsWith(p)) punti += 5;
      else if (paroleNome.some((w) => w.startsWith(p))) punti += 3;
      else if (paroleContesto.some((w) => w.startsWith(p))) punti += 1;
      else {
        tutte = false;
        break;
      }
    }
    if (!tutte) continue;
    // la provincia si trova scrivendone il nome o la sigla, non per le città che contiene
    trovati.push({ luogo: l, etichetta: etichettaLuogo(l, mappa), percorso: percorsoLuogo(l, mappa), punti });
  }

  trovati.sort(
    (a, b) =>
      b.punti - a.punti ||
      ORDINE_LIVELLO[a.luogo.livello] - ORDINE_LIVELLO[b.luogo.livello] ||
      a.etichetta.localeCompare(b.etichetta, "it")
  );
  return trovati.slice(0, max);
}

/**
 * Scegliendo una città si sceglie anche tutto ciò che contiene: i quartieri (e le città, per una provincia) già scelti
 * diventano ridondanti e si tolgono. Toglie anche i doppioni, gli identificativi sconosciuti e ciò che eccede il massimo.
 */
export function semplificaScelte(ids: readonly string[] | null | undefined, mappa: MappaLuoghi): string[] {
  const unici = [...new Set((ids ?? []).filter((id) => mappa.has(id)))];
  const risultato = unici.filter((id) => !antenati(id, mappa).slice(1).some((a) => unici.includes(a)));
  return risultato.slice(0, MAX_LUOGHI_SCELTI);
}
