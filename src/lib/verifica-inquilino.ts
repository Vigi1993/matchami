/**
 * La verifica del reddito dell'inquilino: cosa mostrare, cosa manca, cosa si
 * può fare. Logica pura, senza database: si prova con `npm test`.
 *
 * Il percorso dei file e le regole sui tipi ammessi stanno in `verifica.ts`,
 * condivise con i documenti dei proprietari.
 */

export type StatoVerificaInquilino = "non_avviata" | "in_verifica" | "verificato";
export type TipoDocumentoInquilino = "identita" | "reddito";

export const TIPI_DOCUMENTO_INQUILINO: readonly TipoDocumentoInquilino[] = ["identita", "reddito"];

/** Quanti documenti al massimo: è anche il limite del database (migrazione 0018). */
export const LIMITE_DOCUMENTI = 12;

export const ETICHETTE_DOCUMENTO: Record<TipoDocumentoInquilino, string> = {
  identita: "Documento d'identità",
  reddito: "Prova del reddito",
};

export const AIUTO_DOCUMENTO: Record<TipoDocumentoInquilino, string> = {
  identita: "Carta d'identità, patente o passaporto, fronte e retro. Serve a far coincidere il nome.",
  reddito: "Una busta paga recente, la CU o la dichiarazione dei redditi.",
};

export type DocumentoInquilino = {
  id: string;
  tipo: TipoDocumentoInquilino;
  percorso: string;
  nome_file: string;
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

/** Cosa manca prima di poter inviare. Vuoto: si può inviare. */
export function cosaMancaInquilino(input: {
  documenti: Pick<DocumentoInquilino, "tipo">[];
  dati: DatiDichiarati;
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
  if (!input.documenti.some((d) => d.tipo === "reddito")) {
    manca.push("Carica una prova del reddito");
  }
  return manca;
}

/** Si può inviare solo se non è già stato inviato o verificato, e non manca niente. */
export function puoInviareInquilino(input: {
  stato: StatoVerificaInquilino;
  documenti: Pick<DocumentoInquilino, "tipo">[];
  dati: DatiDichiarati;
}): boolean {
  return input.stato === "non_avviata" && cosaMancaInquilino(input).length === 0;
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
