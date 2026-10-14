/**
 * I dati dell'annuncio che chi cerca può filtrare: luogo, tipologia, bagni, piano, riscaldamento, tipo di contratto e
 * disponibilità. Si controllano qui quando arrivano dal modulo; il database li ricontrolla.
 *
 * Tutti facoltativi nel SALVATAGGIO (si può tenere una bozza incompleta) e obbligatori per chiedere la verifica
 * (vedi obbligatori.ts). Il vuoto vale «non indicato»: lo zero NO (il piano 0 è il piano terra).
 */
import { RISCALDAMENTI, TIPI_CONTRATTO } from "../constants";
import { dataValida } from "../match/criteri-ricerca";

export const LIMITI_ANNUNCIO = {
  bagni: { min: 1, max: 10 },
  piano: { min: -2, max: 60 },
  /** la data di disponibilità: non prima di questa, e al massimo tra tanti anni */
  disponibileDa: "2020-01-01",
  anniAvanti: 3,
} as const;

export type DatiImmobile = {
  luogo_id: string | null;
  tipologia: "appartamento" | "villa";
  bagni: number | null;
  piano: number | null;
  riscaldamento: string | null;
  tipo_contratto: string | null;
  disponibile_dal: string | null;
};

export type EsitoDatiImmobile = { ok: true; dati: DatiImmobile } | { ok: false; errore: string };

/** I piani che si scelgono nel modulo: seminterrato, terra, 1°…25°. */
export const OPZIONI_PIANO_ANNUNCIO: readonly { valore: number; etichetta: string }[] = [
  { valore: -1, etichetta: "Seminterrato" },
  { valore: 0, etichetta: "Piano terra" },
  ...Array.from({ length: 25 }, (_, i) => ({ valore: i + 1, etichetta: `${i + 1}°` })),
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vuoto = (v: FormDataEntryValue | null) => v === null || (typeof v === "string" && v.trim() === "");

function intero(v: FormDataEntryValue | null, min: number, max: number): number | null | "errore" {
  if (vuoto(v)) return null;
  if (typeof v !== "string" || !/^-?\d{1,3}$/.test(v.trim())) return "errore";
  const n = Number(v.trim());
  return n >= min && n <= max ? n : "errore";
}

/** `oggi` è AAAA-MM-GG (si passa da fuori per poter provare le date). */
export function leggiDatiImmobile(get: (chiave: string) => FormDataEntryValue | null, oggi: string): EsitoDatiImmobile {
  const errore = (e: string): EsitoDatiImmobile => ({ ok: false, errore: e });

  const luogo = get("luogo_id");
  if (!vuoto(luogo) && (typeof luogo !== "string" || !UUID.test(luogo.trim()))) return errore("La zona scelta non è valida.");

  const tip = get("tipologia");
  const tipologia = vuoto(tip) ? "appartamento" : String(tip).trim();
  if (tipologia === "posto_letto") return errore("Per ora si possono pubblicare solo appartamenti e ville.");
  if (tipologia !== "appartamento" && tipologia !== "villa") return errore("Il tipo di immobile non è valido.");

  const bagni = intero(get("bagni"), LIMITI_ANNUNCIO.bagni.min, LIMITI_ANNUNCIO.bagni.max);
  if (bagni === "errore") return errore(`I bagni devono essere da ${LIMITI_ANNUNCIO.bagni.min} a ${LIMITI_ANNUNCIO.bagni.max}.`);
  const piano = intero(get("piano"), LIMITI_ANNUNCIO.piano.min, LIMITI_ANNUNCIO.piano.max);
  if (piano === "errore") return errore("Il piano non è valido.");

  const elenco = (chiave: string, ammessi: readonly { id: string }[]): string | null | "errore" => {
    const v = get(chiave);
    if (vuoto(v)) return null;
    return typeof v === "string" && ammessi.some((a) => a.id === v.trim()) ? v.trim() : "errore";
  };
  const riscaldamento = elenco("riscaldamento", RISCALDAMENTI);
  if (riscaldamento === "errore") return errore("Il tipo di riscaldamento non è valido.");
  const contratto = elenco("tipo_contratto", TIPI_CONTRATTO);
  if (contratto === "errore") return errore("Il tipo di contratto non è valido.");

  let disponibile: string | null = null;
  const d = get("disponibile_dal");
  if (!vuoto(d)) {
    const limite = new Date(`${oggi}T00:00:00Z`);
    limite.setUTCFullYear(limite.getUTCFullYear() + LIMITI_ANNUNCIO.anniAvanti);
    if (typeof d !== "string" || !dataValida(d.trim()) || d.trim() < LIMITI_ANNUNCIO.disponibileDa || d.trim() > limite.toISOString().slice(0, 10)) {
      return errore("La data di disponibilità non è valida.");
    }
    disponibile = d.trim();
  }

  return {
    ok: true,
    dati: {
      luogo_id: vuoto(luogo) ? null : String(luogo).trim().toLowerCase(),
      tipologia,
      bagni,
      piano,
      riscaldamento,
      tipo_contratto: contratto,
      disponibile_dal: disponibile,
    },
  };
}
