/**
 * L'INFORMATIVA SULLA PRIVACY.
 *
 * QUESTO È IL SOLO FILE DA SOSTITUIRE quando il legale consegna il testo
 * definitivo. Per sostituirlo basta:
 *   1. riscrivere `sezioni` con il testo del legale;
 *   2. mettere `provvisoria: false`;
 *   3. cambiare `versione` (per esempio "2027-01-legale-1").
 * Cambiando la versione, chiunque non abbia accettato la nuova viene
 * fermato alla prossima visita e deve accettarla. Non si tocca altro.
 *
 * Finché `provvisoria` è true, il documento si presenta ovunque come
 * provvisorio. Il testo qui sotto NON è un parere legale: è stato scritto
 * da chi ha costruito l'app, a partire da cosa l'app fa davvero (vedi
 * l'inventario dei dati personali), e descrive solo fatti verificati.
 * I punti da compilare sono segnati con [da indicare].
 */

export type SezioneInformativa = {
  titolo: string;
  paragrafi?: string[];
  elenco?: string[];
};

export const INFORMATIVA = {
  /**
   * Formato: aaaa-mm-<parola>[-<parola>...], in minuscolo. È lo stesso
   * controllo che fa il database (migrazione 0017): un test fallisce se
   * questa stringa non lo supera.
   */
  versione: "2026-10-provvisoria-5",
  provvisoria: true,
  titolo: "Informativa sulla privacy",
  aggiornata: "ottobre 2026",
  avviso:
    "Documento provvisorio per il prototipo. Non è un'informativa legale: verrà sostituito dal testo redatto da un legale prima di qualunque uso con persone reali. Fino ad allora usa solo dati di prova.",
  sezioni: [
    {
      titolo: "Cos'è questo documento",
      paragrafi: [
        "MatchAmI è un prototipo. Questo testo spiega, in modo semplice, quali dati raccoglie e cosa ne fa. È un documento provvisorio: scritto da chi ha costruito l'app, non da un legale.",
      ],
    },
    {
      titolo: "Chi è il titolare",
      paragrafi: [
        "Il titolare del trattamento è [da indicare]. Per le richieste sulla privacy: [da indicare].",
      ],
    },
    {
      titolo: "Quali dati raccogliamo",
      elenco: [
        "Account: email, password (conservata come impronta, non in chiaro), nome, cognome e ruolo, inquilino o proprietario.",
        "Se sei inquilino: lavoro, reddito tuo e del tuo nucleo, garante, fideiussione, protesti (li dichiari tu e non vengono verificati), animali, composizione del nucleo, numero di figli, presentazione, foto del profilo e le tue preferenze di ricerca (budget, zone, locali, metri, caratteristiche).",
        "Se sei proprietario: tipo di proprietario, numero di immobili, obiettivo; gli annunci con titolo, descrizione, zona, prezzo, caratteristiche e foto; i criteri che chiedi ai candidati.",
        "Per le verifiche: il documento d'identità e la prova di proprietà dell'immobile (proprietari); se sei inquilino e chiedi di verificare il reddito, un documento d'identità e una prova del reddito (una busta paga, la CU o la dichiarazione dei redditi); e i contratti di affitto caricati per dichiarare un affitto. Non chiediamo lo stato di famiglia.",
        "Mentre usi l'app: candidature, messaggi, contratti, recensioni, richieste di conferma di un affitto e inviti. Inoltre le notifiche sulle novità del tuo account (per esempio l'esito di una verifica o la risposta a una candidatura): contengono il tipo di evento e, al massimo, il titolo di un annuncio, mai nomi di persone.",
        "Dati di un'altra persona: se inviti il tuo proprietario, scrivi il suo nome e, se vuoi, la sua email.",
      ],
    },
    {
      titolo: "A cosa servono",
      paragrafi: [
        "Servono a far funzionare l'app: creare il tuo account, mostrarti gli annunci e i candidati, calcolare la compatibilità, far scambiare messaggi dopo un'accettazione, e controllare identità e affitti prima di segnare qualcosa come «verificato».",
      ],
    },
    {
      titolo: "Punteggi calcolati automaticamente",
      paragrafi: [
        "La compatibilità (match) e l'affidabilità sono calcolate automaticamente da ciò che dichiari. Servono a ordinare annunci e candidati. La decisione di accettare o rifiutare una candidatura resta sempre del proprietario.",
        "La verifica del reddito invece non è automatica: la decide una persona del team di MatchAmI, guardando i documenti che hai caricato. Se dopo la verifica cambi il lavoro o il reddito indicati, la verifica decade e va rifatta.",
      ],
    },
    {
      titolo: "Chi vede cosa",
      elenco: [
        "Tu vedi tutti i tuoi dati.",
        "Il proprietario di un annuncio a cui ti candidi vede il tuo nome e cognome, il lavoro, il reddito, garante e fideiussione, i protesti che hai dichiarato, se il tuo reddito è verificato, la presentazione, la foto, il punteggio di affidabilità e la compatibilità. Non vede il numero di figli, la composizione del nucleo né se hai animali: sa solo se hai compilato quei campi, per contare quanto è completo il tuo profilo. Non vede le tue preferenze di ricerca.",
        "Se rifiuta la tua candidatura, del tuo profilo gli resta solo il tuo nome, oltre alla valutazione che aveva già fatto. Tu vedi il motivo del rifiuto, non la sua valutazione completa.",
        "Se ritiri una candidatura mentre è ancora in attesa, il proprietario non la vede più: non legge né il tuo profilo né le recensioni su di te, e riceve solo una notifica con il titolo dell'annuncio. La candidatura resta nel tuo elenco e non puoi candidarti di nuovo allo stesso annuncio.",
        "I messaggi li leggono solo le due persone, dopo che la candidatura è stata accettata. L'app ricorda quali messaggi hai già letto, solo per mostrarti quanti ne restano da leggere: non lo mostra all'altra persona.",
        "Nella chat, l'app evidenzia i messaggi che parlano di pagamenti sospetti (per esempio un IBAN, una caparra o un anticipo) e ti avvisa prima di inviarne uno così, per aiutarti a riconoscere una truffa. È un controllo automatico che fa parte della visualizzazione della chat: non salviamo il risultato e non lo comunichiamo a nessuno, e non impedisce mai di inviare un messaggio.",
        "Le recensioni su un inquilino le leggono la persona recensita, chi le ha scritte e i proprietari a cui ha inviato una candidatura.",
        "Gli annunci pubblicati e verificati li vedono tutti gli utenti connessi. L'indirizzo esatto degli immobili non lo raccogliamo.",
        "Il documento d'identità, la prova del reddito, la prova di proprietà e i contratti li vedono solo chi li ha caricati e il team di MatchAmI che li controlla. Un proprietario non vede mai i documenti di un inquilino: vede solo se il reddito è verificato, sì o no. L'altra parte di un affitto non vede il contratto.",
        "Il team di MatchAmI vede nome e cognome di tutti, e gli annunci e gli affitti da verificare. Chi amministra il sistema ha un accesso tecnico a tutti i dati.",
      ],
    },
    {
      titolo: "File e foto",
      paragrafi: [
        "La foto del profilo e le foto degli annunci si aprono con un indirizzo che non richiede l'accesso: chi conosce quel link può vederle. I documenti d'identità, di reddito, di proprietà e i contratti non hanno mai un indirizzo pubblico: si aprono con link temporanei, e solo a chi ne ha diritto.",
      ],
    },
    {
      titolo: "Per quanto tempo conserviamo i dati",
      paragrafi: [
        "Al momento non c'è una scadenza automatica: una candidatura, un messaggio, un invito o un documento restano finché non cancelli l'account. Un documento caricato per la verifica del reddito puoi toglierlo tu, ma solo finché non hai inviato la richiesta. Le notifiche sono pensate per sparire dopo 60 giorni se lette e dopo 180 se non lette, ma questa pulizia non è ancora attiva. I tempi di conservazione saranno definiti nel testo definitivo.",
      ],
    },
    {
      titolo: "Cancellare il tuo account",
      paragrafi: [
        "Puoi cancellare l'account da Profilo, Account e accesso. Se sei inquilino spariscono tutti i tuoi dati, compresi i documenti e le recensioni su di te. Se sei proprietario spariscono tutti i tuoi dati, tranne le recensioni che hai scritto su inquilini ancora iscritti, che restano senza il tuo nome.",
        "Non c'è ancora un modo per scaricare i tuoi dati.",
      ],
    },
    {
      titolo: "Fornitori e cookie",
      paragrafi: [
        "Usiamo Supabase (database, accessi, file e le email di accesso) e Vercel (per ospitare l'app, che può conservare registri tecnici delle richieste). La regione dei dati è [da indicare].",
        "Nell'app non ci sono strumenti di analisi né pubblicità. Usiamo solo cookie tecnici, necessari a mantenerti connesso.",
      ],
    },
    {
      titolo: "Consensi facoltativi",
      paragrafi: [
        "Puoi attivare o disattivare il consenso a marketing e partner da Profilo, Privacy e consensi. Oggi non inviamo comunicazioni di marketing né condividiamo dati con partner.",
      ],
    },
    {
      titolo: "I tuoi diritti",
      paragrafi: [
        "Per sapere quali dati abbiamo su di te, correggerli o fare altre richieste, scrivi a [da indicare]. Il testo definitivo descriverà i tuoi diritti in dettaglio.",
      ],
    },
    {
      titolo: "Se questo testo cambia",
      paragrafi: [
        "Quando questo documento viene sostituito o modificato, ti chiederemo di leggerlo e accettarlo di nuovo prima di continuare.",
      ],
    },
  ] satisfies SezioneInformativa[],
} as const;

/** Il segnaposto da compilare. Un solo modo di scriverlo, così si trova con una ricerca. */
export const SEGNAPOSTO = "[da indicare]";
