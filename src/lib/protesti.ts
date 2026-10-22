/**
 * La verifica dei PROTESTI da parte dello staff: cosa dire alla persona, cosa manca per chiederla, cosa si può fare.
 * Logica pura, senza database: si prova con `npm test`. Le regole vere stanno nella migrazione 0038.
 *
 * Funziona come la verifica del reddito (stessi stati, stessi documenti da caricare, stesso passaggio dallo staff) ma è un percorso SEPARATO: si può far
 * verificare l'uno senza l'altro. Il risultato dello staff PREVALE su ciò che la persona aveva dichiarato, e una volta verificato non si cambia più da soli.
 */
import type { DescrizioneStato, DocumentoInquilino, StatoVerificaInquilino } from "@/lib/verifica-inquilino";
import { fraseValidita, type VerificheLette } from "@/lib/scadenze-verifiche";

export type StatoProtesti = StatoVerificaInquilino;

/** I documenti che servono: il certificato dei protesti e il documento d'identità (lo stesso del reddito: se c'è già, vale). */
export const TIPI_DOCUMENTO_PROTESTI = ["identita", "protesti"] as const;

export const ETICHETTE_DOCUMENTO_PROTESTI: Record<(typeof TIPI_DOCUMENTO_PROTESTI)[number], string> = {
  identita: "Documento d'identità",
  protesti: "Certificato dei protesti",
};

export const AIUTO_DOCUMENTO_PROTESTI: Record<(typeof TIPI_DOCUMENTO_PROTESTI)[number], string> = {
  identita: "Carta d'identità, patente o passaporto, fronte e retro. Se l'hai già caricato per il reddito, non serve di nuovo.",
  protesti: "Il certificato o la visura dei protesti intestati a te, recente. Si chiede alla Camera di Commercio, anche online.",
};

/** Cosa dire alla persona sullo stato della sua verifica dei protesti (`protestato` è il valore che vale oggi). */
export function descriviStatoProtesti(stato: StatoProtesti, nota: string | null, protestato: boolean | null): DescrizioneStato {
  if (stato === "verificato") {
    return protestato === true
      ? {
          titolo: "Protesti verificati: risultano dei protesti",
          testo:
            "Lo staff ha controllato il tuo certificato: risultano dei protesti. Il tuo punteggio di affidabilità ne tiene conto e i proprietari vedono che è un dato verificato. Se qualcosa non è corretto, scrivici.",
          tono: "no",
        }
      : {
          titolo: "Protesti verificati: nessun protesto",
          testo:
            "Lo staff ha controllato il tuo certificato: non risultano protesti. I proprietari vedono «Protesti verificati» accanto al tuo nome, e il tuo punteggio ne tiene conto.",
          tono: "ok",
        };
  }
  if (stato === "in_verifica") {
    return { titolo: "In verifica", testo: "Stiamo controllando il certificato. Finché non rispondiamo non puoi toglierlo, ma puoi aggiungerne altri.", tono: "attesa" };
  }
  if (nota && nota.trim()) {
    return { titolo: "Verifica non riuscita", testo: `${nota.trim()} Correggi e invia di nuovo.`, tono: "no" };
  }
  return {
    titolo: "Non ancora verificato",
    testo:
      "Carica il certificato dei protesti e un documento d'identità: lo staff controlla se risulti protestato o no. Il risultato dello staff vale più di ciò che hai dichiarato.",
    tono: "neutro",
  };
}

/**
 * Cosa dire sulla verifica dei protesti tenendo conto della SCADENZA (3 mesi): valida (con la data), in scadenza, scaduta. Senza una verifica valida o
 * scaduta vale la descrizione di sempre (`descriviStatoProtesti`).
 */
export function descriviVerificaProtesti(input: { stato: StatoProtesti; nota: string | null; protestato: boolean | null; ver: VerificheLette }): DescrizioneStato {
  const { stato, nota, protestato, ver } = input;
  const s = ver.protesti;
  if (!s || s.fase === "non_avviata" || s.fase === "in_verifica") return descriviStatoProtesti(stato, nota, protestato);
  const rinnovoNonRiuscito = nota && nota.trim() ? ` Il rinnovo non è riuscito: ${nota.trim()}` : "";
  if (s.fase === "scaduta") {
    return { titolo: "Verifica dei protesti scaduta", testo: `${fraseValidita("protesti", s)} La risposta si può correggere, poi rinnova la verifica con un certificato recente.${rinnovoNonRiuscito}`, tono: "no" };
  }
  const base = descriviStatoProtesti("verificato", null, protestato);
  return {
    titolo: s.fase === "in_scadenza" ? `${base.titolo} · in scadenza` : base.titolo,
    testo: [base.testo, fraseValidita("protesti", s), rinnovoNonRiuscito.trim()].filter(Boolean).join(" "),
    tono: s.fase === "in_scadenza" ? "attesa" : base.tono,
  };
}

/** Cosa manca prima di poter inviare. Vuoto: si può inviare. Serve un certificato NUOVO (quello già verificato non conta per un rinnovo). */
export function cosaMancaProtesti(input: { documenti: Pick<DocumentoInquilino, "tipo" | "verificato_at">[]; protestato: boolean | null }): string[] {
  const manca: string[] = [];
  if (input.protestato === null) manca.push("Rispondi alla domanda sui protesti, in «I tuoi dati»");
  if (!input.documenti.some((d) => d.tipo === "identita")) manca.push("Carica un documento d'identità");
  if (!input.documenti.some((d) => d.tipo === "protesti" && !d.verificato_at)) manca.push("Carica il certificato dei protesti");
  return manca;
}

/** Si può inviare la prima volta, o come rinnovo quando sta per scadere o è scaduta (`rinnovabile`), e solo se non manca niente. Mai mentre lo staff controlla. */
export function puoInviareProtesti(input: { stato: StatoProtesti; documenti: Pick<DocumentoInquilino, "tipo" | "verificato_at">[]; protestato: boolean | null; rinnovabile?: boolean }): boolean {
  const primaVolta = input.stato === "non_avviata";
  const rinnovo = input.stato === "verificato" && input.rinnovabile === true;
  return (primaVolta || rinnovo) && cosaMancaProtesti(input).length === 0;
}

/** I documenti si tolgono solo finché la verifica dei protesti non è partita (regola del database). */
export function puoTogliereDocumentiProtesti(stato: StatoProtesti): boolean {
  return stato === "non_avviata";
}

/**
 * La domanda sui protesti non si cambia più da soli quando lo staff l'ha verificata, FINCHÉ LA VERIFICA VALE (`valida`): scaduta, la risposta si può
 * correggere e poi si rinnova. Senza `valida` (dati vecchi) vale lo stato.
 */
export function rispostaBloccata(stato: StatoProtesti, valida: boolean = stato === "verificato"): boolean {
  return stato === "verificato" && Boolean(valida);
}

/** Cosa si scrive sotto la domanda sui protesti nei dati: lo dice, a seconda dello stato, che li verifica lo staff. */
export function notaDomandaProtesti(stato: StatoProtesti, valida: boolean = stato === "verificato"): string {
  if (stato === "verificato" && !valida) return "La verifica dello staff è scaduta: puoi correggere la risposta, poi rinnova la verifica in «Verifica dei protesti», qui sotto.";
  if (stato === "verificato") return "Verificato dallo staff: non si cambia da soli. Se qualcosa non è corretto, scrivici.";
  if (stato === "in_verifica") return "Lo staff sta controllando il tuo certificato: il risultato vale più di questa risposta.";
  return "Lo verifica il nostro staff: carica il certificato dei protesti in «Verifica dei protesti», qui sotto. Il risultato vale più di questa risposta.";
}

/** Le frasi sotto la sezione «Verifica dei protesti» della scheda dei dati. */
export const TESTI_VERIFICA_PROTESTI = {
  titolo: "Verifica dei protesti",
  introduzione:
    "Se risulti protestato o no lo verifica il nostro staff: carica il certificato dei protesti e un documento d'identità. Il risultato dello staff vale più di ciò che hai dichiarato, e i proprietari lo vedono come dato verificato.",
  riservatezza:
    "Li vedi tu e il team di MatchAmI che li controlla. Il proprietario non li vede mai: vede solo se i protesti sono verificati, sì o no. Non hanno un indirizzo pubblico e si cancellano insieme al tuo account. Finché non invii la richiesta puoi togliere un documento caricato per sbaglio.",
} as const;

/** Per i proprietari: come si chiama il dato quando lo ha verificato lo staff. */
export function etichettaProtestiPerProprietario(protestato: boolean | null, verificati: boolean): string {
  if (protestato === null) return "Protesti non indicati";
  if (verificati) return protestato ? "Protesti (verificati dallo staff)" : "Nessun protesto (verificato dallo staff)";
  return protestato ? "Protesti dichiarati" : "Nessun protesto dichiarato";
}
