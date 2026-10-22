/**
 * La verifica del reddito dell'inquilino: cosa mostrare, cosa manca, cosa si
 * può fare. Logica pura, senza database: si prova con `npm test`.
 *
 * Il percorso dei file e le regole sui tipi ammessi stanno in `verifica.ts`,
 * condivise con i documenti dei proprietari.
 */

import { fraseCopertura, fraseValidita, frasiProveMancanti, type VerificheLette } from "@/lib/scadenze-verifiche";

export type StatoVerificaInquilino = "non_avviata" | "in_verifica" | "verificato";
export type TipoDocumentoInquilino = "identita" | "reddito" | "protesti";

/** I documenti della verifica del REDDITO. Il certificato dei protesti è della verifica dei protesti (lib/protesti.ts). */
export const TIPI_DOCUMENTO_INQUILINO: readonly TipoDocumentoInquilino[] = ["identita", "reddito"];

/** Quanti documenti al massimo: è anche il limite del database (migrazione 0040). */
export const LIMITE_DOCUMENTI = 20;

export const ETICHETTE_DOCUMENTO: Record<TipoDocumentoInquilino, string> = {
  identita: "Documento d'identità",
  reddito: "Prova del reddito",
  protesti: "Certificato dei protesti",
};

export const AIUTO_DOCUMENTO: Record<TipoDocumentoInquilino, string> = {
  identita: "Carta d'identità, patente o passaporto, fronte e retro. Serve a far coincidere il nome.",
  reddito: "Una busta paga recente, la CU o la dichiarazione dei redditi.",
  protesti: "Il certificato o la visura dei protesti intestati a te, recente.",
};

export type DocumentoInquilino = {
  id: string;
  tipo: TipoDocumentoInquilino;
  percorso: string;
  nome_file: string;
  /** di chi è la prova del reddito: 1 = la persona stessa, 2… = gli altri percettori del nucleo (migrazione 0040) */
  persona?: number | null;
  /** quanto dimostra, scritto dallo staff quando l'ha verificato */
  importo_verificato?: number | null;
  /** quando lo staff l'ha verificato (se manca, è un documento nuovo, ancora da controllare) */
  verificato_at?: string | null;
};

export type DatiDichiarati = {
  professione: string | null;
  reddito_mensile: number | null;
};

export type DescrizioneStato = {
  titolo: string;
  testo: string;
  tono: "neutro" | "attesa" | "ok" | "no";
};

/** Cosa dire alla persona sullo stato della sua verifica. */
export function descriviStatoInquilino(
  stato: StatoVerificaInquilino,
  nota: string | null
): DescrizioneStato {
  if (stato === "verificato") {
    return {
      titolo: "Reddito verificato",
      testo:
        "I proprietari vedono «Reddito verificato» accanto al tuo nome, e il tuo punteggio di affidabilità ne tiene conto. Se cambi il lavoro o il reddito, la verifica decade e va rifatta.",
      tono: "ok",
    };
  }
  if (stato === "in_verifica") {
    return {
      titolo: "In verifica",
      testo:
        "Stiamo controllando i documenti. Finché non rispondiamo non puoi toglierli, ma puoi aggiungerne altri.",
      tono: "attesa",
    };
  }
  if (nota && nota.trim()) {
    return {
      titolo: "Verifica non riuscita",
      testo: `${nota.trim()} Correggi e invia di nuovo.`,
      tono: "no",
    };
  }
  return {
    titolo: "Non ancora verificato",
    testo:
      "Carica un documento d'identità e una prova del reddito: se li confermiamo, i proprietari vedranno «Reddito verificato» e il tuo punteggio di affidabilità sale.",
    tono: "neutro",
  };
}

/**
 * Cosa dire alla persona sulla sua verifica del reddito, tenendo conto della SCADENZA e di quanta parte del reddito del nucleo è documentata. Se non c'è
 * una verifica valida o scaduta, vale la descrizione di sempre (`descriviStatoInquilino`).
 */
export function descriviVerificaReddito(input: { stato: StatoVerificaInquilino; nota: string | null; ver: VerificheLette }): DescrizioneStato {
  const { stato, nota, ver } = input;
  const s = ver.reddito;
  if (!s || s.fase === "non_avviata" || s.fase === "in_verifica") return descriviStatoInquilino(stato, nota);
  const rinnovoNonRiuscito = nota && nota.trim() ? ` Il rinnovo non è riuscito: ${nota.trim()}` : "";
  if (s.fase === "scaduta") {
    return { titolo: "Verifica del reddito scaduta", testo: `${fraseValidita("reddito", s)}${rinnovoNonRiuscito}`, tono: "no" };
  }
  const parziale = ver.coperturaReddito !== null && ver.coperturaReddito < 1;
  const parti = [
    "I proprietari vedono «Reddito verificato» accanto al tuo nome, e il tuo punteggio di affidabilità ne tiene conto.",
    fraseValidita("reddito", s),
    parziale ? `I documenti coprono solo una parte del reddito del nucleo che hai dichiarato (${fraseCopertura(ver.redditoDichiarato, ver.redditoNucleoVerificato)}): i punti del reddito sono in proporzione. Aggiungi la prova del reddito degli altri componenti.` : "",
    rinnovoNonRiuscito.trim(),
  ].filter(Boolean);
  return { titolo: s.fase === "in_scadenza" ? "Reddito verificato · in scadenza" : parziale ? "Reddito verificato in parte" : "Reddito verificato", testo: parti.join(" "), tono: s.fase === "in_scadenza" || parziale ? "attesa" : "ok" };
}

/** Cosa manca prima di poter inviare. Vuoto: si può inviare. Serve una prova del reddito NUOVA per ogni persona del nucleo con un reddito. */
export function cosaMancaInquilino(input: {
  documenti: Pick<DocumentoInquilino, "tipo" | "persona" | "verificato_at">[];
  dati: DatiDichiarati;
  /** quante persone del nucleo hanno un reddito (di solito una) */
  redditiNucleo?: number | null;
}): string[] {
  const manca: string[] = [];
  if (!input.dati.professione || !input.dati.professione.trim()) {
    manca.push("Indica il tuo lavoro nel profilo, in «I tuoi dati»");
  }
  if (!input.dati.reddito_mensile || input.dati.reddito_mensile <= 0) {
    manca.push("Indica il tuo reddito mensile nel profilo, in «I tuoi dati»");
  }
  if (!input.documenti.some((d) => d.tipo === "identita")) {
    manca.push("Carica un documento d'identità");
  }
  // le prove già verificate non contano per un nuovo invio: serve una prova nuova per ogni persona
  manca.push(...frasiProveMancanti(input.documenti.filter((d) => d.tipo === "reddito" && !d.verificato_at), input.redditiNucleo));
  return manca;
}

/**
 * Si può inviare se la verifica non è partita (prima volta) oppure se è un rinnovo o un'integrazione consentiti (`rinnovabile`, da lib/scadenze-verifiche),
 * e non manca niente. Mai mentre lo staff sta già controllando.
 */
export function puoInviareInquilino(input: {
  stato: StatoVerificaInquilino;
  documenti: Pick<DocumentoInquilino, "tipo" | "persona" | "verificato_at">[];
  dati: DatiDichiarati;
  redditiNucleo?: number | null;
  rinnovabile?: boolean;
}): boolean {
  const primaVolta = input.stato === "non_avviata";
  const rinnovo = input.stato === "verificato" && input.rinnovabile === true;
  return (primaVolta || rinnovo) && cosaMancaInquilino(input).length === 0;
}

/** I documenti si tolgono solo finché non si è inviato niente (regola del database). */
export function puoTogliereDocumenti(stato: StatoVerificaInquilino): boolean {
  return stato === "non_avviata";
}

/** Si può aggiungere un documento se non si è al limite. */
export function puoAggiungereDocumento(quanti: number): boolean {
  return quanti < LIMITE_DOCUMENTI;
}

/** La riga che il profilo mostra per aprire il pannello. */
export function rigaProfilo(
  stato: StatoVerificaInquilino,
  nota: string | null
): { titolo: string; sottotitolo: string; cta: string } {
  if (stato === "verificato") {
    return {
      titolo: "Reddito verificato",
      sottotitolo: "I proprietari lo vedono accanto al tuo nome.",
      cta: "Vedi i dettagli",
    };
  }
  if (stato === "in_verifica") {
    return {
      titolo: "Reddito in verifica",
      sottotitolo: "Stiamo controllando i documenti che hai inviato.",
      cta: "Vedi lo stato",
    };
  }
  if (nota && nota.trim()) {
    return {
      titolo: "La verifica non è riuscita",
      sottotitolo: "Leggi cosa non andava e invia di nuovo.",
      cta: "Vedi perché",
    };
  }
  return {
    titolo: "Verifica il tuo reddito",
    sottotitolo:
      "Carica un documento d'identità e una prova del reddito: i proprietari vedranno «Reddito verificato».",
    cta: "Inizia",
  };
}
