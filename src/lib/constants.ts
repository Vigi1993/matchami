export const LAVORO_VOCAB = [
  "Dipendente indeterminato",
  "Dipendente determinato",
  "Libero professionista",
  "Studente",
  "Pensionato",
] as const;

export const ATTR_VOCAB = [
  { key: "balcone", label: "Balcone" },
  { key: "terrazzo", label: "Terrazzo" },
  { key: "giardino", label: "Giardino condominiale" },
  { key: "doppiaEsposizione", label: "Doppia esposizione" },
  { key: "ascensore", label: "Ascensore" },
  { key: "portineria", label: "Portineria" },
  { key: "ariaCondizionata", label: "Aria condizionata" },
  { key: "boxAuto", label: "Box auto / posto auto" },
  { key: "cantina", label: "Cantina / ripostiglio" },
  { key: "arredato", label: "Arredato" },
  { key: "animaliAmmessi", label: "Animali ammessi" },
] as const;

// Punto di partenza: finché non ci sono ancora annunci veri nel database,
// usiamo le zone del prototipo. Quando ci saranno listing reali, questa
// lista potrà arrivare da `select distinct zona from listings`.
export const ZONE_MILANO = [
  "Navigli, Milano",
  "Isola, Milano",
  "Porta Romana, Milano",
  "Città Studi, Milano",
  "Bicocca, Milano",
  "Porta Nuova, Milano",
  "Porta Venezia, Milano",
  "Sempione, Milano",
  "Ticinese, Milano",
  "Loreto, Milano",
  "NoLo, Milano",
  "Certosa, Milano",
  "Lambrate, Milano",
] as const;

// Qualità che un proprietario può riconoscere a un inquilino. Sono le
// stesse etichette che finiscono in `recensioni.tag`.
export const TAG_RECENSIONE = [
  "Puntuale nei pagamenti",
  "Casa lasciata in ottimo stato",
  "Comunicazione facile",
  "Rispettoso del vicinato",
  "Segnala subito i problemi",
  "Rinnoverei il contratto",
] as const;

/** Cosa si cerca (e cosa si affitta). Il posto letto è previsto ma non ancora disponibile. */
export const TIPOLOGIE = [
  { id: "appartamento", label: "Appartamento", disponibile: true },
  { id: "villa", label: "Villa", disponibile: true },
  { id: "posto_letto", label: "Posto letto", disponibile: false },
] as const;

/** I tipi di contratto di locazione ad uso abitativo che un proprietario può proporre. */
export const TIPI_CONTRATTO = [
  { id: "libero_4_4", label: "4+4 libero" },
  { id: "concordato_3_2", label: "3+2 concordato" },
  { id: "transitorio", label: "Transitorio" },
  { id: "studenti", label: "Studenti universitari" },
] as const;

export const RISCALDAMENTI = [
  { id: "autonomo", label: "Autonomo" },
  { id: "centralizzato", label: "Centralizzato" },
  { id: "teleriscaldamento", label: "Teleriscaldamento" },
  { id: "pompa_di_calore", label: "Pompa di calore" },
] as const;
