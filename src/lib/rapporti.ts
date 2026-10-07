/**
 * Rapporti di locazione dichiarati e confermati: la parte che non dipende
 * dalla rete. Le regole vere stanno nel database (migrazione 0013).
 */

export type StatoRapporto = "da_verificare" | "verificato" | "respinto";
export type StatoRichiesta = "in_attesa" | "confermata" | "rifiutata";
export type RuoloRapporto = "inquilino" | "proprietario";

export type RichiestaMia = {
  id: string;
  token: string;
  stato: StatoRichiesta;
  /** l'immobile, come testo: il titolo se l'ha scelto il proprietario, l'indirizzo se l'ha scritto l'inquilino */
  immobile: string | null;
  periodo_da: string;
  periodo_a: string | null;
  scaduta: boolean;
};

export type RapportoMio = {
  id: string;
  stato: StatoRapporto;
  esito_note: string | null;
  periodo_da: string;
  periodo_a: string | null;
  immobile: string | null;
  /** nome dell'altra persona, se si riesce a leggerlo */
  controparte: string | null;
  /** l'ho dichiarato io: solo chi lo ha dichiarato può ritirarlo */
  creatoDaMe: boolean;
  /** c'è già un feedback legato a questo affitto */
  recensito: boolean;
  /** il voto, solo per chi l'ha dato (il proprietario); l'inquilino non lo vede */
  votoDato: number | null;
};

export type ImmobileScelta = { id: string; titolo: string; zona: string };

export type Descrizione = {
  etichetta: string;
  tono: "ok" | "attesa" | "da_fare" | "respinto";
  testo: string;
};

/** Come si presenta un rapporto già confermato dall'altra persona. */
export function descriviRapporto(stato: StatoRapporto, note: string | null): Descrizione {
  if (stato === "verificato") {
    return {
      etichetta: "Verificato",
      tono: "ok",
      testo: "Il contratto è stato controllato: questo affitto vale per i feedback.",
    };
  }
  if (stato === "respinto") {
    return {
      etichetta: "Respinto",
      tono: "respinto",
      testo: note?.trim()
        ? "Il controllo non è andato a buon fine. Puoi ritirare la richiesta e dichiararla di nuovo."
        : "Il controllo non è andato a buon fine.",
    };
  }
  return {
    etichetta: "In verifica",
    tono: "attesa",
    testo: "L'altra persona ha confermato. Ora controlliamo il contratto.",
  };
}

/** Come si presenta una richiesta ancora senza una conferma. */
export function descriviRichiesta(stato: StatoRichiesta, scaduta: boolean): Descrizione {
  if (stato === "rifiutata") {
    return {
      etichetta: "Rifiutata",
      tono: "respinto",
      testo: "L'altra persona ha detto che non corrisponde. Puoi ritirarla e correggere i dati.",
    };
  }
  if (stato === "confermata") {
    return {
      etichetta: "Confermata",
      tono: "attesa",
      testo: "L'altra persona ha confermato.",
    };
  }
  if (scaduta) {
    return {
      etichetta: "Scaduta",
      tono: "respinto",
      testo: "Nessuna risposta in 30 giorni. Ritirala e creane una nuova.",
    };
  }
  return {
    etichetta: "In attesa di conferma",
    tono: "da_fare",
    testo: "Manda il link all'altra persona: deve aprirlo e confermare.",
  };
}

/** Il ruolo che deve rispondere a una richiesta creata da `creatore`. */
export function ruoloControparte(creatore: RuoloRapporto): RuoloRapporto {
  return creatore === "inquilino" ? "proprietario" : "inquilino";
}

export function linkRichiesta(origine: string, token: string): string {
  return `${origine.replace(/\/+$/, "")}/rapporto/${encodeURIComponent(token)}`;
}

/**
 * Il messaggio da mandare all'altra persona. Non presume il genere di
 * nessuno e dice cosa succederà, compreso che il contratto non lo vedrà.
 */
export function messaggioRichiesta(input: {
  nomeCreatore: string | null;
  ruolo: RuoloRapporto;
  link: string;
}): string {
  const io = input.nomeCreatore ? ` Sono ${input.nomeCreatore}.` : "";
  const come = input.ruolo === "inquilino" ? "come inquilino" : "come proprietario";
  return (
    `Ciao!${io} Ho dichiarato su MatchAmI l'affitto che abbiamo avuto insieme, ${come}. ` +
    `Puoi confermarlo da questo link? Vedrai i dati principali, non il contratto, ` +
    `che controlla il team di MatchAmI. ${input.link}`
  );
}

// ------------------------------------------------------------
// Controlli prima di inviare
// ------------------------------------------------------------

function comeData(valore: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valore)) return null;
  const t = Date.parse(valore + "T00:00:00Z");
  return Number.isNaN(t) ? null : t;
}

/**
 * Il periodo di un affitto già cominciato, in "aaaa-mm-gg". Restituisce il
 * messaggio da mostrare, oppure `null` se va bene. `oggi` si passa per poter
 * provare i casi senza dipendere dalla data del giorno.
 */
export function validaPeriodo(da: string, a: string, oggi: string): string | null {
  const inizio = comeData(da);
  if (inizio === null) return "Scrivi quando è cominciato l'affitto.";
  const adesso = comeData(oggi);
  if (adesso !== null && inizio > adesso) {
    return "L'affitto deve essere già cominciato: la data di inizio non può essere futura.";
  }
  if (a.trim() !== "") {
    const fine = comeData(a);
    if (fine === null) return "La data di fine non è valida.";
    if (fine < inizio) return "La fine dell'affitto non può essere prima dell'inizio.";
  }
  return null;
}

export function validaIndirizzo(testo: string): string | null {
  const t = testo.trim();
  if (t.length < 3) return "Scrivi l'indirizzo dell'immobile, in poche parole.";
  if (t.length > 200) return "L'indirizzo è troppo lungo.";
  return null;
}
