/**
 * Il modello di contratto PROVVISORIO: una BOZZA DI PROVA senza valore legale.
 *
 * Serve a costruire e provare tutto il percorso (comporre il documento dai dati
 * dell'affitto, mostrarlo, scaricarlo in PDF) prima di avere un modello validato da un
 * legale (punto 4). Per questo il testo è volutamente MINIMO e DESCRITTIVO: non contiene
 * clausole né richiami di legge, perché scriverli non spetta a questo file. Quello che
 * non sappiamo resta «[da indicare]»; non si inventa mai.
 *
 * Non va firmato e non va usato come contratto: lo dice in cima, in ogni pagina e con
 * una filigrana sul PDF.
 */
import { DA_INDICARE, formattaDataIso, nomeCompleto } from "./dati";
import type { DatiContratto, ModelloContratto, Sezione } from "./tipi";

export const TESTO_BOZZA =
  "BOZZA DI PROVA. Questo documento è generato da MatchAmI con un modello di prova: non è un contratto valido, non ha valore legale e non va firmato.";
export const TESTO_ABBREVIATO = "Alcuni testi erano molto lunghi e sono stati abbreviati con «…»: controlla i dati.";
export const TESTO_DA_COMPLETARE =
  "Le parti indicate come «[da indicare]» vanno completate, e il testo delle clausole va sostituito da un modello verificato da un professionista prima di qualunque uso.";

const euro = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const euro2 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export const modelloProvvisorio: ModelloContratto = {
  id: "provvisorio",
  versione: "1",
  origine: "provvisorio",

  genera(dati: DatiContratto) {
    const mancanti = new Set<string>();
    /** il valore, o «[da indicare]» (e si ricorda cosa manca) */
    const v = (valore: string | null, etichetta: string): string => {
      if (valore !== null && valore !== "") return valore;
      mancanti.add(etichetta);
      return DA_INDICARE;
    };
    /** un dato che non raccogliamo: c'è sempre da indicarlo */
    const sempre = (etichetta: string): string => v(null, etichetta);

    const locatore = v(nomeCompleto(dati.locatore.nome, dati.locatore.cognome), "nome del locatore");
    const conduttore = v(nomeCompleto(dati.conduttore.nome, dati.conduttore.cognome), "nome del conduttore");

    const i = dati.immobile;
    const indirizzo = i.indirizzo ? `${i.indirizzo.via} ${i.indirizzo.civico}, ${i.indirizzo.cap} ${i.indirizzo.citta}` : null;
    const caratteristiche = [
      `${v(i.locali !== null ? String(i.locali) : null, "numero di locali")} locali`,
      `${v(i.mq !== null ? String(i.mq) : null, "superficie")} mq`,
    ].join(", ");

    // «mq» e non «m²»: l'apice non si vede in tutti i visualizzatori di PDF
    const classe = i.classeEnergetica
      ? `${i.classeEnergetica}${i.epGlobale !== null ? `, indice di prestazione energetica ${euro2.format(i.epGlobale)} kWh/mq all'anno` : ""}`
      : v(null, "classe energetica");

    const durata = v(dati.durataMesi !== null ? `${dati.durataMesi} ${dati.durataMesi === 1 ? "mese" : "mesi"}` : null, "durata");
    const inizio = v(formattaDataIso(dati.dataInizio), "data di inizio");
    const canone = v(dati.canone !== null ? `${euro.format(dati.canone)} euro` : null, "canone mensile");

    const sezioni: Sezione[] = [
      {
        titolo: "1. Le parti",
        paragrafi: [
          `Locatore: ${locatore}, codice fiscale ${sempre("codice fiscale del locatore")}, residente in ${sempre("residenza del locatore")}.`,
          `Conduttore: ${conduttore}, codice fiscale ${sempre("codice fiscale del conduttore")}, residente in ${sempre("residenza del conduttore")}.`,
        ],
      },
      {
        titolo: "2. L'immobile",
        paragrafi: [
          `Il locatore concede in locazione al conduttore, per uso abitativo, l'immobile «${v(i.titolo, "titolo dell'immobile")}», situato in ${v(indirizzo, "indirizzo dell'immobile")}${i.zona ? ` (zona: ${i.zona})` : ""}, di ${caratteristiche}.`,
          `Classe energetica: ${classe}.`,
        ],
      },
      {
        titolo: "3. Durata",
        paragrafi: [`La locazione ha durata di ${durata}, a partire dal ${inizio}.`],
      },
      {
        titolo: "4. Canone",
        paragrafi: [
          `Il canone è di ${canone} al mese.`,
          `Modalità e scadenza di pagamento: ${sempre("modalità e scadenza di pagamento")}.`,
        ],
      },
      { titolo: "5. Deposito cauzionale", paragrafi: [`Importo e modalità: ${sempre("deposito cauzionale")}.`] },
      { titolo: "6. Utenze e spese", paragrafi: [`Ripartizione: ${sempre("utenze e spese")}.`] },
      { titolo: "7. Registrazione e altre condizioni", paragrafi: [`${sempre("registrazione e altre condizioni")}.`] },
      { titolo: "8. Luogo e data", paragrafi: [`Luogo e data della firma: ${sempre("luogo e data della firma")}.`] },
    ];

    return {
      titolo: "Bozza di contratto di locazione ad uso abitativo",
      sottotitolo: "Modello di prova",
      avvisi: [TESTO_BOZZA, TESTO_DA_COMPLETARE, ...(dati.troncato ? [TESTO_ABBREVIATO] : [])],
      sezioni,
      firme: [
        { ruolo: "Il locatore", nome: nomeCompleto(dati.locatore.nome, dati.locatore.cognome) },
        { ruolo: "Il conduttore", nome: nomeCompleto(dati.conduttore.nome, dati.conduttore.cognome) },
      ],
      daIndicare: [...mancanti],
    };
  },
};
