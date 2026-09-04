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
