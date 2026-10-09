/**
 * Come è fatta l'email di riepilogo: oggetto, testo e HTML. Logica pura, senza
 * database né rete: si prova con `npm test`.
 *
 * REGOLE
 *  - l'oggetto è GENERICO: appare nelle anteprime delle notifiche del telefono, e
 *    non deve rivelare niente (nemmeno il titolo di un annuncio);
 *  - il contenuto sono le stesse notifiche che si vedono nell'app, con gli stessi
 *    testi: titoli di annunci e, per le visite, giorno e ora. Mai nomi di persone
 *    né il testo di un messaggio;
 *  - TUTTO ciò che arriva da altri (il titolo di un annuncio lo scrive il
 *    proprietario) si «escapa» nell'HTML: non può inserire codice né link;
 *  - nessuna immagine, nessun tracciamento, nessun indirizzo che passi da un
 *    servizio che registri i clic: i link vanno dritti all'app;
 *  - in fondo, sempre: perché si riceve e come smettere, con un clic.
 */
import { descriviNotifica } from "../notifiche";
import { percorsoInterno } from "../percorso";

export type NotificaEmail = {
  id: string;
  tipo: string;
  dati: Record<string, unknown> | null;
  link: string;
  created_at: string;
};

export const MASSIMO_NOTIFICHE_IN_UNA_EMAIL = 20;

export type RiepilogoEmail = {
  oggetto: string;
  testo: string;
  html: string;
  /** la pagina dove la persona conferma */
  urlDisiscrizione: string;
  /** l'indirizzo per l'«annulla iscrizione» dei programmi di posta (un clic, senza accedere) */
  urlUnClic: string;
  intestazioni: Record<string, string>;
};

/** Il codice di disattivazione: 64 caratteri esadecimali, come lo genera il database. */
export function tokenValido(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

/** Tutto ciò che in HTML ha un significato diventa testo. */
export function escapaHtml(testo: unknown): string {
  return String(testo ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Il primo nome, per il saluto: senza invii a capo né caratteri strani, al massimo 40. */
export function nomeBreve(nome: unknown): string | null {
  if (typeof nome !== "string") return null;
  const primo = nome
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, " ")
    .trim()
    .split(/\s+/)[0];
  if (!primo) return null;
  return primo.slice(0, 40);
}

/**
 * L'indirizzo base dell'app, pulito: https (o http solo per l'ambiente locale),
 * senza credenziali, senza percorso, senza barra finale. Nullo se non è valido.
 */
export function indirizzoBase(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const locale = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && locale)) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

export function oggettoRiepilogo(n: number): string {
  return n === 1 ? "Una novità su MatchAmI" : `${n} novità su MatchAmI`;
}

/** «…e un'altra novità.» / «…e altre 5 novità.» */
export function frasePerLeAltre(n: number): string {
  return n === 1 ? "…e un'altra novità." : `…e altre ${n} novità.`;
}

/** L'indirizzo assoluto di una notifica: sempre dentro l'app, mai fuori. */
function indirizzoNotifica(base: string, link: string): string {
  return base + percorsoInterno(link, "/notifiche");
}

/**
 * Compone l'email. Lancia un errore se l'indirizzo base o il codice non sono
 * validi: chi chiama controlla prima, e un link sbagliato in un'email non si
 * può correggere dopo.
 */
export function componiRiepilogo(entrata: {
  nome: unknown;
  notifiche: NotificaEmail[];
  urlApp: string;
  token: string;
}): RiepilogoEmail {
  const base = indirizzoBase(entrata.urlApp);
  if (!base) throw new Error("Indirizzo dell'app non valido");
  if (!tokenValido(entrata.token)) throw new Error("Codice di disattivazione non valido");

  const tutte = entrata.notifiche;
  const mostrate = tutte.slice(0, MASSIMO_NOTIFICHE_IN_UNA_EMAIL);
  const altre = tutte.length - mostrate.length;

  const urlDisiscrizione = `${base}/email/disiscrivi/${entrata.token}`;
  const urlUnClic = `${base}/api/email/disiscrivi/${entrata.token}`;
  const urlNovita = `${base}/notifiche`;

  const nome = nomeBreve(entrata.nome);
  const saluto = nome ? `Ciao ${nome},` : "Ciao,";
  const intro = tutte.length === 1 ? "hai una novità su MatchAmI:" : `hai ${tutte.length} novità su MatchAmI:`;

  const voci = mostrate.map((n) => {
    const t = descriviNotifica(n.tipo, n.dati);
    return { titolo: t.titolo, testo: t.testo, url: indirizzoNotifica(base, n.link) };
  });

  // ---- testo semplice ----
  const righe: string[] = [saluto, "", intro, ""];
  for (const v of voci) righe.push(`• ${v.titolo}`, `  ${v.testo}`, `  ${v.url}`, "");
  if (altre > 0) righe.push(frasePerLeAltre(altre), "");
  righe.push(`Apri tutte le novità: ${urlNovita}`, "", "—", "Ricevi questa email perché hai un account su MatchAmI.", `Per smettere di riceverle: ${urlDisiscrizione}`);
  const testo = righe.join("\n");

  // ---- HTML: stile in linea, niente immagini, niente tracciamento ----
  const stile = 'font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#10151a;';
  const elenco = voci
    .map(
      (v) =>
        `<li style="margin:0 0 14px 0;"><b>${escapaHtml(v.titolo)}</b><br>${escapaHtml(v.testo)}<br><a href="${escapaHtml(v.url)}" style="color:#3e6b57;">Apri</a></li>`
    )
    .join("");
  const html =
    `<div style="${stile}max-width:520px;margin:0 auto;padding:16px;">` +
    `<p style="margin:0 0 12px 0;">${escapaHtml(saluto)}</p>` +
    `<p style="margin:0 0 12px 0;">${escapaHtml(intro)}</p>` +
    `<ul style="padding-left:18px;margin:0 0 12px 0;">${elenco}</ul>` +
    (altre > 0 ? `<p style="margin:0 0 12px 0;">${escapaHtml(frasePerLeAltre(altre))}</p>` : "") +
    `<p style="margin:0 0 20px 0;"><a href="${escapaHtml(urlNovita)}" style="color:#3e6b57;">Apri tutte le novità</a></p>` +
    `<hr style="border:0;border-top:1px solid #ddd;margin:0 0 12px 0;">` +
    `<p style="margin:0;font-size:12px;color:#5a6670;">Ricevi questa email perché hai un account su MatchAmI. ` +
    `<a href="${escapaHtml(urlDisiscrizione)}" style="color:#5a6670;">Smetti di riceverle</a></p>` +
    `</div>`;

  return {
    oggetto: oggettoRiepilogo(tutte.length),
    testo,
    html,
    urlDisiscrizione,
    urlUnClic,
    intestazioni: {
      "List-Unsubscribe": `<${urlUnClic}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
