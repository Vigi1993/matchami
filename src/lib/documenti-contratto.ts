/**
 * I documenti di un contratto (APE, planimetria, ricevute, registrazione): tipi, controlli sul
 * file, percorso nell'archivio, testi. Logica pura, senza database né rete.
 *
 * Le regole sono quelle della migrazione 0028: un test le tiene allineate.
 */
import { èUuid } from "./uuid";
import { DIMENSIONE_MAX_BYTE, estensioneDa, validaFileDocumento } from "./verifica";

export const BUCKET_DOCUMENTI_CONTRATTO = "documenti-contratto";

export const TIPI_DOCUMENTO = [
  { id: "ape", etichetta: "Certificato energetico (APE)" },
  { id: "planimetria", etichetta: "Planimetria" },
  { id: "ricevuta", etichetta: "Ricevuta del canone" },
  { id: "registrazione", etichetta: "Registrazione del contratto" },
  { id: "altro", etichetta: "Altro" },
] as const;

export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number]["id"];

export const LIMITI_DOCUMENTI = {
  maxByte: DIMENSIONE_MAX_BYTE,
  maxPerContratto: 30,
  maxNome: 200,
} as const;

export type TipoFile = "application/pdf" | "image/jpeg" | "image/png";

/** Un documento come lo restituisce `documenti_dei_miei_contratti`: mai il percorso del file. */
export type DocumentoContratto = {
  id: string;
  contratto_id: string;
  tipo: TipoDocumento;
  nome_file: string;
  dimensione: number;
  tipo_file: TipoFile;
  created_at: string;
  /** l'ho caricato io */
  mio: boolean;
  da_ruolo: "locatore" | "conduttore";
};

export function tipoDocumentoValido(x: unknown): x is TipoDocumento {
  return typeof x === "string" && TIPI_DOCUMENTO.some((t) => t.id === x);
}

export function etichettaTipo(tipo: string): string {
  return TIPI_DOCUMENTO.find((t) => t.id === tipo)?.etichetta ?? "Documento";
}

// ------------------------------------------------------------
// Cosa c'è DAVVERO dentro il file
// ------------------------------------------------------------

/**
 * Riconosce un file dai suoi PRIMI byte, non dal nome né dal tipo dichiarato (li sceglie chi
 * carica). Solo PDF, JPEG e PNG, e solo se il file COMINCIA come tali: un testo HTML o uno script
 * chiamato «ricevuta.pdf» non passa.
 */
export function riconosciFile(bytes: Uint8Array | null | undefined): { tipo_file: TipoFile; estensione: "pdf" | "jpg" | "png" } | null {
  if (!bytes || bytes.length < 4) return null;
  const inizia = (firma: number[]) => firma.every((b, i) => bytes[i] === b);
  if (inizia([0x25, 0x50, 0x44, 0x46, 0x2d])) return { tipo_file: "application/pdf", estensione: "pdf" }; // %PDF-
  if (inizia([0xff, 0xd8, 0xff])) return { tipo_file: "image/jpeg", estensione: "jpg" };
  if (inizia([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { tipo_file: "image/png", estensione: "png" };
  return null;
}

// ------------------------------------------------------------
// Il percorso nell'archivio: <id utente>/<id>.<estensione>, piatto
// ------------------------------------------------------------

export function percorsoArchivio(input: { userId: string; id: string; estensione: string }): string {
  if (!èUuid(input.userId) || !èUuid(input.id)) throw new Error("Identificativo non valido");
  if (!["pdf", "jpg", "png"].includes(input.estensione)) throw new Error("Estensione non ammessa");
  return `${input.userId.toLowerCase()}/${input.id.toLowerCase()}.${input.estensione}`;
}

/** Il percorso è nella cartella di questa persona, ed è fatto come li fa `percorsoArchivio`? */
export function percorsoDiUtente(percorso: unknown, userId: string): boolean {
  if (typeof percorso !== "string" || !èUuid(userId)) return false;
  return new RegExp(`^${userId.toLowerCase()}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(pdf|jpg|png)$`).test(percorso);
}

// ------------------------------------------------------------
// Il nome del file
// ------------------------------------------------------------

/** Il nome scelto da chi carica: spazi ridotti, niente caratteri di controllo né separatori di cartelle, al massimo 200. */
export function nomeFilePulito(nome: unknown): string {
  if (typeof nome !== "string") return "";
  const t = nome
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g, " ")
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return [...t].slice(0, LIMITI_DOCUMENTI.maxNome).join("");
}

/**
 * Il nome per l'intestazione di scaricamento. Una versione «sicura» in ASCII (per i programmi che non
 * capiscono altro) e una in UTF-8 (RFC 5987). Mai virgolette, a capo o separatori di cartelle: sono il
 * modo di rompere un'intestazione. L'estensione è quella vera del file, non quella scritta da chi ha caricato.
 */
export function nomeDaScaricare(nome: unknown, estensione: string): { ascii: string; utf8: string } {
  const ext = ["pdf", "jpg", "png"].includes(estensione) ? estensione : "bin";
  let base = nomeFilePulito(nome).replace(/\.[A-Za-z0-9]{1,5}$/, "");
  if (base === "") base = "documento";
  const ascii = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 100).trim() || "documento";
  const utf8 = encodeURIComponent([...base].slice(0, 100).join("")).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return { ascii: `${ascii}.${ext}`, utf8: `${utf8}.${ext}` };
}

/** Il file scelto, prima di caricarlo. Il messaggio, o `null` se va bene. */
export function validaFileScelto(file: { type: string; size: number; name?: string }): string | null {
  const base = validaFileDocumento(file);
  if (base) return base;
  if (nomeFilePulito(file.name ?? "") === "") return "Il file non ha un nome valido. Rinominalo e riprova.";
  return null;
}

/** Il tipo dichiarato dal browser, per scegliere l'estensione (che poi si confronta con il contenuto vero). */
export function estensioneDichiarata(tipo: string): "pdf" | "jpg" | "png" | null {
  const e = estensioneDa(tipo);
  return e === "pdf" || e === "jpg" || e === "png" ? e : null;
}

// ------------------------------------------------------------
// Testi e raggruppamenti
// ------------------------------------------------------------

/** «850 KB», «1,2 MB». */
export function formattaDimensione(byte: unknown): string {
  if (typeof byte !== "number" || !Number.isFinite(byte) || byte < 0) return "";
  if (byte < 1024) return `${Math.round(byte)} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Chi l'ha caricato, a ruoli (mai un nome): «Caricato da te», «dal proprietario», «dall'inquilino». */
export function chiHaCaricato(d: Pick<DocumentoContratto, "mio" | "da_ruolo">): string {
  if (d.mio) return "Caricato da te";
  return d.da_ruolo === "locatore" ? "Caricato dal proprietario" : "Caricato dall'inquilino";
}

/** I documenti divisi per contratto, dal più recente. Non modifica l'elenco ricevuto. */
export function raggruppaPerContratto(righe: readonly DocumentoContratto[] | null | undefined): Record<string, DocumentoContratto[]> {
  const fuori: Record<string, DocumentoContratto[]> = {};
  for (const r of righe ?? []) {
    if (!r || typeof r.contratto_id !== "string") continue;
    (fuori[r.contratto_id] ??= []).push(r);
  }
  for (const k of Object.keys(fuori)) fuori[k] = [...fuori[k]].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return fuori;
}

export function postiRimasti(nDocumenti: number): number {
  return Math.max(0, LIMITI_DOCUMENTI.maxPerContratto - Math.max(0, nDocumenti));
}

export const TESTO_ARCHIVIO =
  "Li vedono entrambe le parti del contratto. Puoi eliminare solo i documenti che hai caricato tu.";
export const TESTO_LIMITE_RAGGIUNTO =
  "Questo contratto ha già 30 documenti. Elimina uno che non serve più per aggiungerne altri.";
