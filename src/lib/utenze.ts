/**
 * Bollette e utenze: i collegamenti ai fornitori. Per ora sono link DI ESEMPIO,
 * su domini riservati agli esempi (example.com, definito apposta per questo):
 * nessun fornitore vero, nessun nome reale, nessun rapporto commerciale.
 *
 * PER METTERE I FORNITORI VERI: si sostituiscono le voci di `CATALOGO_UTENZE`
 * con `esempio: false` e l'indirizzo vero. I test impongono:
 *  - indirizzi https, senza parametri di tracciamento né credenziali;
 *  - un link con un rapporto commerciale ha `sponsorizzato: true` e viene
 *    mostrato come tale, e l'informativa deve dirlo;
 *  - finché sono link di esempio, solo domini riservati agli esempi.
 *
 * I link sono semplici collegamenti: l'app NON registra su quale si clicca e non
 * passa al sito del fornitore nessun dato (niente parametri, niente referrer).
 * Registrare i clic sarebbe un dato nuovo: da decidere, dichiarare e far vedere a
 * un legale prima.
 *
 * Logica pura, senza database: si prova con `npm test`.
 */

export type CategoriaUtenza = "luce" | "gas" | "internet";

export const CATEGORIE_UTENZE: readonly { id: CategoriaUtenza; etichetta: string }[] = [
  { id: "luce", etichetta: "Luce" },
  { id: "gas", etichetta: "Gas" },
  { id: "internet", etichetta: "Internet" },
];

export type LinkUtenza = {
  id: string;
  categoria: CategoriaUtenza;
  nome: string;
  descrizione: string;
  url: string;
  /** un link di prova, non un fornitore vero */
  esempio: boolean;
  /** c'è un rapporto commerciale con chi lo offre: va detto a chi guarda */
  sponsorizzato: boolean;
};

export const CATALOGO_UTENZE: readonly LinkUtenza[] = [
  { id: "luce-a", categoria: "luce", nome: "Fornitore luce A", descrizione: "Offerta a prezzo fisso per 12 mesi.", url: "https://example.com/utenze/luce-a", esempio: true, sponsorizzato: false },
  { id: "luce-b", categoria: "luce", nome: "Fornitore luce B", descrizione: "Offerta a prezzo variabile, senza vincoli.", url: "https://example.com/utenze/luce-b", esempio: true, sponsorizzato: false },
  { id: "gas-a", categoria: "gas", nome: "Fornitore gas A", descrizione: "Offerta a prezzo fisso per 12 mesi.", url: "https://example.com/utenze/gas-a", esempio: true, sponsorizzato: false },
  { id: "gas-b", categoria: "gas", nome: "Fornitore gas B", descrizione: "Offerta a prezzo variabile, senza vincoli.", url: "https://example.com/utenze/gas-b", esempio: true, sponsorizzato: false },
  { id: "internet-a", categoria: "internet", nome: "Fibra A", descrizione: "Fibra fino a 1 Giga, attivazione in pochi giorni.", url: "https://example.com/utenze/internet-a", esempio: true, sponsorizzato: false },
  { id: "internet-b", categoria: "internet", nome: "Fibra B", descrizione: "Fibra e telefono, con router incluso.", url: "https://example.com/utenze/internet-b", esempio: true, sponsorizzato: false },
];

/** I domini riservati agli esempi (RFC 2606): non esistono servizi veri, e nessuno li può possedere. */
export const DOMINI_ESEMPIO: readonly string[] = ["example.com", "example.org", "example.net"];

/** Nomi di parametri che servono a seguire una persona o a pagare una commissione. */
const PARAMETRI_DI_TRACCIAMENTO =
  /^(utm_|ref$|referrer$|aff|partner|source$|campaign|clickid|click_id|cid$|gclid|fbclid|msclkid|mc_|sub_?id|tid$|tracking|pid$|affid)/i;

export type EsitoUrl = { ok: true } | { ok: false; motivo: string };

/** Un indirizzo è accettabile se è https, senza credenziali, e senza parametri di tracciamento. */
export function controllaUrl(url: unknown): EsitoUrl {
  if (typeof url !== "string" || !url.trim()) return { ok: false, motivo: "vuoto" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "non è un indirizzo" };
  }
  if (u.protocol !== "https:") return { ok: false, motivo: "non è https" };
  if (u.username || u.password) return { ok: false, motivo: "contiene credenziali" };
  for (const nome of u.searchParams.keys()) {
    if (PARAMETRI_DI_TRACCIAMENTO.test(nome)) return { ok: false, motivo: `parametro di tracciamento «${nome}»` };
  }
  return { ok: true };
}

/** È un indirizzo di un dominio riservato agli esempi (compresi i sottodomini)? */
export function eDominioEsempio(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOMINI_ESEMPIO.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * I link che si possono mostrare: quelli con un indirizzo accettabile. Uno non
 * valido si scarta, non si mostra rotto o pericoloso.
 */
export function linkMostrabili(catalogo: readonly LinkUtenza[]): LinkUtenza[] {
  return catalogo.filter((l) => controllaUrl(l.url).ok && !!l.nome?.trim());
}

/** I link divisi per categoria, nell'ordine delle categorie; le categorie senza link non compaiono. */
export function raggruppaPerCategoria(
  catalogo: readonly LinkUtenza[]
): { id: CategoriaUtenza; etichetta: string; link: LinkUtenza[] }[] {
  const visibili = linkMostrabili(catalogo);
  return CATEGORIE_UTENZE.map((c) => ({ ...c, link: visibili.filter((l) => l.categoria === c.id) })).filter((g) => g.link.length > 0);
}

export function haEsempi(catalogo: readonly LinkUtenza[]): boolean {
  return linkMostrabili(catalogo).some((l) => l.esempio);
}

export function haSponsorizzati(catalogo: readonly LinkUtenza[]): boolean {
  return linkMostrabili(catalogo).some((l) => l.sponsorizzato);
}

// ------------------------------------------------------------
// Testi
// ------------------------------------------------------------

export const SOTTOTITOLO_UTENZE = "Attiva luce, gas e internet nella tua nuova casa.";

export const AVVISO_ESEMPIO = "Sono link di esempio: i fornitori veri si sceglieranno più avanti.";

export const ETICHETTA_SPONSORIZZATO = "Sponsorizzato";

export const NOTA_LINK_ESTERNI =
  "I link si aprono in una nuova scheda, sul sito del fornitore. MatchAmI non registra su cosa clicchi e non passa al fornitore nessun dato su di te.";
