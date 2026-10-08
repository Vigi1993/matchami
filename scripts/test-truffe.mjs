/**
 * Test del rilevatore di messaggi sui pagamenti sospetti (src/lib/truffe.ts).
 * Si lancia con:   npm test
 *
 * Il rilevatore è un consiglio, non un divieto, e può sbagliare nei due sensi.
 * Questi test fissano cosa deve segnalare e, soprattutto, cosa NON deve
 * segnalare: un avviso che scatta sulle frasi di tutti i giorni insegna a non
 * leggere gli avvisi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { caricaTs, radice } from "./carica-ts.mjs";

const t = caricaTs(path.join(radice, "src", "lib", "truffe.ts"));
const r = (s) => t.rilevaRischioPagamento(s);

// ------------------------------------------------------------
// Cosa DEVE far scattare l'avviso forte
// ------------------------------------------------------------

const ALTO = [
  // IBAN: compatto, a gruppi, con punti, dentro una frase, con un finto prefisso
  "Ti mando l'IBAN: IT60X0542811101000000123456",
  "IBAN IT60 X054 2811 1010 0000 0123 456 intestato a Mario Rossi",
  "it60x0542811101000000123456",
  "Fai il bonifico qui: IT60-X054-2811-1010-0000-0123-456, grazie",
  "GB82 WEST 1234 5698 7654 32",
  "DE89 3704 0044 0532 0130 00",
  // un IBAN italiano ricopiato male resta un IBAN
  "IT12 A123 4567 8901 2345 6789 012",
  // mezzi di pagamento difficili da annullare
  "Puoi pagare con Western Union, è sicuro",
  "paga con western-union e mi mandi la ricevuta",
  "MoneyGram o Western Union, come preferisci",
  "Ricaricami la Postepay con 500 euro",
  "fai una ricarica sulla carta prepagata",
  "Ti mando il numero della Poste Pay",
  "Preferisco ricevere in bitcoin",
  "possiamo fare in criptovalute?",
  "Mi bastano delle gift card da 100 euro",
  "compra dei buoni amazon e mandami i codici",
  "paypal con la formula amici e familiari così non ci sono commissioni",
  // pagamento prima di vedere la casa
  "Prima di vedere la casa devi pagare la caparra",
  "Puoi inviare il pagamento senza vedere l'appartamento",
  "non serve vedere la casa, mandami solo la caparra",
  "Non è necessario vedere la casa, mandami la caparra",
  "pagamento anticipato, senza visitare niente",
  // la storia delle chiavi
  "Sono all'estero per lavoro, ti spedisco le chiavi con un corriere dopo il pagamento",
  "Mi trovo attualmente in Inghilterra, le chiavi te le mando io",
  "Vivo all'estero e per questo ti invio le chiavi per pacco",
  // forme offuscate
  "W3stern Un10n va benissimo",
  "ricarica la P0stepay",
  "per pagare usa B1tcoin",
];

for (const frase of ALTO) {
  test(`ALTO: ${frase.slice(0, 70)}`, () => {
    const x = r(frase);
    assert.equal(x.livello, "alto", JSON.stringify(x));
    assert.ok(x.segnali.length >= 1);
  });
}

// ------------------------------------------------------------
// Cosa fa scattare l'avviso più misurato
// ------------------------------------------------------------

const ATTENZIONE = [
  "Mi serve una caparra di 800 euro per bloccare l'appartamento",
  "Per bloccare la casa serve una caparra",
  "Devi versare un anticipo di 500 euro",
  "per bloccare l'appartamento serve un acconto di 300 euro",
  "mandami l'acconto di 1000 euro",
  "Ti chiedo un bonifico per bloccare la casa",
  "Fai un bonifico di caparra",
  "b0nifico per la c4parra",
  "Per la c a p a r r a ti mando i dati",
];

for (const frase of ATTENZIONE) {
  test(`ATTENZIONE: ${frase.slice(0, 70)}`, () => {
    const x = r(frase);
    assert.equal(x.livello, "attenzione", JSON.stringify(x));
  });
}

// ------------------------------------------------------------
// Cosa NON deve segnalare (le frasi di tutti i giorni)
// ------------------------------------------------------------

const NESSUNO_ATTESO = [
  "Buongiorno, l'appartamento è ancora disponibile?",
  "Possiamo vederci sabato alle 10 per una visita?",
  "Il canone è di 1200 euro al mese, spese escluse.",
  "Il prezzo è 900 euro, trattabile.",
  "Ti mando il mio numero: 333 123 4567",
  "Il mio numero è 02 1234567",
  "Il mio codice fiscale è RSSMRA80A01F205X",
  "Il contratto numero 2023ABC12345678 è registrato",
  "Anticipo la visita a venerdì, va bene?",
  "Posso anticipare l'ingresso di una settimana?",
  "Ti anticipo che il garage è piccolo",
  "Il contratto si firma il 15, porta un documento d'identità.",
  "L'affitto si paga entro il 5 di ogni mese.",
  "Il deposito cauzionale è di tre mensilità, lo versiamo alla firma del contratto.",
  "Ti va bene un bonifico bancario per le mensilità?",
  "La casa è al terzo piano senza ascensore.",
  "Sono all'estero per lavoro fino a domenica, ci sentiamo lunedì.",
  "Sono all'estero, ti spedisco i documenti per email.",
  "Appena controllo la posta ti rispondo",
  "Ricarica il telefono prima di venire, la zona non prende bene",
  "Ricarica la scheda del telefono prima di venire",
  "Ricarica una scheda telefonica, qui non c'è campo",
  "Ricarica la batteria del telefono",
  "Hai un garante o una fideiussione?",
  "Mi mandi una foto del tuo contratto di lavoro?",
  "Le chiavi te le do io di persona alla firma",
  "Ti aspetto davanti al portone con le chiavi",
  "Hai già visto la casa? Possiamo organizzare una seconda visita.",
  "La caldaia è nuova e le spese di condominio sono 80 euro",
  "Grazie mille, a presto!",
  "ok",
  "👍",
  "Posso portare il mio cane?",
  "Posso chiamarti alle 18?",
  "Scrivimi su WhatsApp se preferisci",
];

for (const frase of NESSUNO_ATTESO) {
  test(`NESSUNO: ${frase.slice(0, 70)}`, () => {
    const x = r(frase);
    assert.equal(x.livello, "nessuno", `ha segnalato «${frase}»: ${JSON.stringify(x)}`);
    assert.deepEqual(x.segnali, []);
  });
}

// ------------------------------------------------------------
// IBAN: la somma di controllo e i falsi positivi
// ------------------------------------------------------------

test("IBAN: un codice fiscale non è un IBAN", () => {
  for (const cf of ["RSSMRA80A01F205X", "VRDLGU75C15H501Z", "il codice è BNCLRA90D45F205K ok"]) {
    assert.equal(r(cf).livello, "nessuno", cf);
  }
});

test("IBAN: un numero lungo qualunque, o una targa, non lo è", () => {
  for (const f of ["Il mio numero è 3331234567890", "targa AB123CD", "pratica 12345678901234567890", "cap 20121 Milano, via Roma 12"]) {
    assert.equal(r(f).livello, "nessuno", f);
  }
});

test("IBAN: viene riconosciuto anche con maiuscole e minuscole miste e con ritorni a capo", () => {
  assert.equal(r("iT60 x054 2811\n1010 0000 0123 456").livello, "alto");
  assert.equal(r("Ecco:\nIT60X0542811101000000123456\nGrazie").livello, "alto");
});

test("IBAN: il motivo detto alla persona è quello giusto", () => {
  assert.deepEqual(r("IT60X0542811101000000123456").segnali, ["un IBAN o un numero di conto"]);
});

// ------------------------------------------------------------
// Più segnali, livello, ordine
// ------------------------------------------------------------

test("un messaggio con più segnali li elenca tutti e prende il livello più alto", () => {
  const x = r("Per la caparra usa Western Union, oppure IT60X0542811101000000123456");
  assert.equal(x.livello, "alto");
  assert.equal(x.segnali.length, 3);
  assert.ok(x.segnali.includes("un IBAN o un numero di conto"));
  assert.ok(x.segnali.some((s) => /Western Union/.test(s)));
  assert.ok(x.segnali.includes("una caparra o un anticipo da versare"));
});

test("lo stesso segnale non si ripete, anche se la parola compare più volte", () => {
  const x = r("caparra caparra caparra, una caparra");
  assert.equal(x.livello, "attenzione");
  assert.equal(x.segnali.length, 1);
});

test("il risultato non dipende da una chiamata precedente", () => {
  const a = r("Western Union"); r("caparra"); r("ciao"); const b = r("Western Union");
  assert.deepEqual(a, b);
});

// ------------------------------------------------------------
// Input strani: mai un errore, mai lentezza
// ------------------------------------------------------------

test("input non valido: nessun rischio, nessun errore", () => {
  for (const x of [null, undefined, "", "   ", "\n\n", 42, {}, [], NaN]) {
    assert.deepEqual(r(x), { livello: "nessuno", segnali: [] }, String(x));
  }
});

test("un messaggio enorme non rallenta e non fa crollare niente", () => {
  for (const grande of ["a".repeat(1_000_000), "IT60 ".repeat(200_000), "caparra ".repeat(100_000), "sono all'estero ".repeat(50_000) + "chiavi", " ".repeat(1_000_000) + "Western Union", "a b ".repeat(333_333)]) {
    const inizio = Date.now();
    r(grande);
    assert.ok(Date.now() - inizio < 1500, `troppo lento: ${Date.now() - inizio} ms`);
  }
});

test("del riempimento davanti non nasconde un IBAN: si guarda tutto il messaggio", () => {
  // il difetto di una versione precedente: si leggevano solo i primi 5000 caratteri
  const IBAN = "IT60X0542811101000000123456";
  assert.equal(r("ciao ".repeat(1200) + " " + IBAN).livello, "alto");
  assert.equal(r("ciao ".repeat(20_000) + " " + IBAN).livello, "alto");
  assert.equal(r(IBAN + " " + "ciao ".repeat(20_000)).livello, "alto");
});

test("oltre il limite enorme si guardano inizio e fine, e questo limite è dichiarato", () => {
  assert.equal(t.LIMITE_ANALISI, 200_000);
  const riempimento = "ciao ".repeat(300_000);
  assert.equal(r("Western Union " + riempimento).livello, "alto", "inizio");
  assert.equal(r(riempimento + " Western Union").livello, "alto", "fine");
  // nel mezzo di un messaggio da un milione e mezzo di caratteri non si guarda: è il limite, e qui è documentato
  assert.equal(r(riempimento + " Western Union " + riempimento).livello, "nessuno", "metà: fuori dall'analisi");
});

test("stringhe costruite per far impazzire le espressioni regolari non bloccano", () => {
  const inizio = Date.now();
  for (const x of ["IT12" + "A123".repeat(5000), "A1 ".repeat(3000), "prima di vedere " + "x ".repeat(2500) + "pagare", "b ".repeat(2500), "ricarica " + "la ".repeat(2000)]) r(x);
  assert.ok(Date.now() - inizio < 3000, `troppo lento: ${Date.now() - inizio} ms`);
});

test("accenti, apostrofi tipografici e maiuscole non cambiano il risultato", () => {
  assert.equal(r("SONO ALL’ESTERO E TI SPEDISCO LE CHIAVI CON UN CORRIERE").livello, "alto");
  assert.equal(r("Sono all’estero, ti spedisco le chiavi con un corrière").livello, "alto");
  assert.equal(r("CAPARRA").livello, "attenzione");
});

test("importi, orari e numeri di piano non fanno scattare niente", () => {
  assert.equal(r("Il canone è 1000 euro, 3 mesi di cauzione, 4 locali, 5 piano").livello, "nessuno");
  assert.equal(r("ci vediamo alle 10 e 30 al 4 piano").livello, "nessuno");
});

// ------------------------------------------------------------
// I testi
// ------------------------------------------------------------

const alto = r("Western Union");
const medio = r("Mi serve una caparra");

test("testi: un messaggio ricevuto, due livelli, con tono diverso", () => {
  const a = t.testoAvvisoMessaggio(alto), m = t.testoAvvisoMessaggio(medio);
  assert.match(a, /Non mandare soldi prima di aver visto la casa e firmato il contratto/);
  assert.match(m, /Ricorda: niente pagamenti prima di aver visto la casa e firmato il contratto/);
  assert.notEqual(a, m);
  assert.equal(t.testoAvvisoMessaggio({ livello: "nessuno", segnali: [] }), "");
});

test("testi: prima di inviare non accusa chi scrive, ricorda la regola", () => {
  const c = t.testoConfermaInvio(alto);
  assert.match(c, /Il messaggio che stai per inviare parla di/);
  assert.match(c, /nessun pagamento va fatto prima di aver visto la casa e firmato il contratto/);
  assert.ok(!/\b(sei un truffatore|truffatore|truffa tu)\b/i.test(c), c);
  assert.equal(t.testoConfermaInvio({ livello: "nessuno", segnali: [] }), "");
});

test("testi: l'elenco dei motivi è grammaticale con uno, due, tre", () => {
  assert.match(t.testoAvvisoMessaggio({ livello: "alto", segnali: ["un IBAN"] }), /parla di un IBAN\./);
  assert.match(t.testoAvvisoMessaggio({ livello: "alto", segnali: ["un IBAN", "una caparra"] }), /parla di un IBAN e una caparra\./);
  assert.match(t.testoAvvisoMessaggio({ livello: "alto", segnali: ["un IBAN", "una caparra", "le chiavi"] }), /parla di un IBAN, una caparra e le chiavi\./);
});

test("testi: l'avviso fisso e l'elenco dei segni sono completi e senza promesse che non si mantengono", () => {
  assert.match(t.AVVISO_FISSO, /Non pagare mai caparre, anticipi o affitti prima di aver visto la casa e firmato un contratto/);
  assert.equal(t.SEGNI_DI_TRUFFA.length, 5);
  assert.ok(t.SEGNI_DI_TRUFFA.every((x) => x.trim().endsWith(".")), "ogni segno è una frase");
  // oggi non esiste la segnalazione di una conversazione (punto 25) né un assistente: non si promettono
  const tutto = [t.AVVISO_FISSO, t.CONSIGLIO_FINALE, ...t.SEGNI_DI_TRUFFA].join(" ");
  assert.ok(!/segnal(a|i|are|azione)|scrivici|contattaci|assistenza|supporto|bloccheremo|verifichiamo i messaggi/i.test(tutto), tutto);
  assert.equal(t.CONSIGLIO_FINALE, "Se hai un dubbio, non pagare.");
});

test("testi: non presumono il genere di nessuno", () => {
  const tutto = [t.AVVISO_FISSO, t.CONSIGLIO_FINALE, ...t.SEGNI_DI_TRUFFA, t.testoAvvisoMessaggio(alto), t.testoConfermaInvio(alto), t.testoAvvisoMessaggio(medio)].join(" ");
  assert.ok(!/\b(lui|lei|il truffatore|la truffatrice)\b/i.test(tutto), tutto);
});

// ------------------------------------------------------------
// Grammatica: i motivi si leggono dopo «parla di»
// ------------------------------------------------------------

/** Tutti i motivi che il rilevatore può dare, ottenuti da messaggi che li fanno scattare. */
const TUTTI_I_MOTIVI = [...new Set([
  "IT60X0542811101000000123456", "Western Union", "Prima di vedere la casa devi pagare la caparra",
  "Sono all'estero e ti spedisco le chiavi", "Mi serve una caparra",
].flatMap((f) => r(f).segnali))];

test("grammatica: i motivi sono cinque e nessuno comincia con un articolo determinativo", () => {
  assert.equal(TUTTI_I_MOTIVI.length, 5, TUTTI_I_MOTIVI.join(" | "));
  for (const m of TUTTI_I_MOTIVI) {
    assert.ok(!/^(la|il|lo|le|i|gli|l')\b/i.test(m), `«${m}» comincia con un articolo: «parla di ${m}» è sbagliato`);
  }
});

test("grammatica: ogni frase che li usa è italiano corretto, mai «di la», «di il», «di le»…", () => {
  for (const motivo of TUTTI_I_MOTIVI) {
    for (const frase of [t.testoAvvisoMessaggio({ livello: "alto", segnali: [motivo] }), t.testoConfermaInvio({ livello: "attenzione", segnali: [motivo] })]) {
      assert.ok(!/\b(di|a|da|in|su) (la|il|lo|le|i|gli) /i.test(frase), `preposizione e articolo non fusi: ${frase}`);
    }
  }
});

test("grammatica: il controllo sa fermare un motivo con l'articolo (la prova che non è vuoto)", () => {
  const sbagliato = t.testoAvvisoMessaggio({ livello: "alto", segnali: ["la richiesta di una caparra"] });
  assert.ok(/\b(di|a|da|in|su) (la|il|lo|le|i|gli) /i.test(sbagliato), sbagliato);
});

// ------------------------------------------------------------
// Il risultato non esce da lì: non si salva e non si invia (è ciò che dice l'informativa)
// ------------------------------------------------------------

const leggi = (...parti) => fs.readFileSync(path.join(radice, ...parti), "utf8");

test("privacy: il rilevatore non ha dipendenze né accesso alla rete, né salva niente", () => {
  const codice = leggi("src", "lib", "truffe.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const vietato of [/\bimport\b/, /\brequire\(/, /\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /supabase/i, /console\./]) {
    assert.ok(!vietato.test(codice), `il rilevatore usa ${vietato}`);
  }
});

test("privacy: la chat non manda il risultato da nessuna parte: nell'invio ci sono solo i tre campi di sempre", () => {
  const chat = leggi("src", "app", "chat", "[id]", "ChatClient.tsx");
  const inserimenti = [...chat.matchAll(/\.insert\(\{([^}]*)\}\)/g)];
  assert.equal(inserimenti.length, 1, "dovrebbe esserci un solo inserimento");
  const campi = [...inserimenti[0][1].matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(campi, ["candidatura_id", "mittente_id", "testo"]);
  // E il rischio non viene usato in nessun'altra chiamata verso il database. Le chiamate sono tre:
  // il canale in tempo reale, l'invio (qui sopra) e «segna come letti» (messaggi non letti).
  assert.equal((chat.match(/createClient\(\)/g) ?? []).length, 3, "attese solo le tre chiamate note (canale, segna come letti, invio)");
  const rpc = [...chat.matchAll(/\.rpc\(\s*"([a-z_]+)"\s*,\s*\{([^}]*)\}/g)];
  assert.equal(rpc.length, 1, "attesa una sola chiamata rpc");
  assert.equal(rpc[0][1], "segna_messaggi_letti");
  assert.equal(rpc[0][2].trim(), "p_candidatura: candidaturaId", "la chiamata deve portare solo l'id della conversazione, mai il testo o il rischio");
});

test("privacy: i componenti degli avvisi non fanno chiamate di rete", () => {
  const comp = leggi("src", "components", "AvvisiChat.tsx");
  for (const vietato of [/fetch\(/, /createClient/, /supabase/i, /XMLHttpRequest/, /sendBeacon/, /localStorage/]) {
    assert.ok(!vietato.test(comp), `AvvisiChat usa ${vietato}`);
  }
});

test("privacy: i controlli sanno fermare un rilevatore che comunica il risultato", () => {
  const cattivo = 'export function f(t) { fetch("/api/segnala", { method: "POST", body: t }); }';
  assert.ok(/\bfetch\(/.test(cattivo));
  const cattivaChat = 'await supabase.from("messaggi").insert({ candidatura_id: 1, testo: t, rischio: "alto" })';
  const campi = [...cattivaChat.matchAll(/\.insert\(\{([^}]*)\}\)/g)][0][1].match(/(\w+):/g).map((x) => x.slice(0, -1)).sort();
  assert.notDeepEqual(campi, ["candidatura_id", "mittente_id", "testo"]);
});
