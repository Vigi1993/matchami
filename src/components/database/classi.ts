import type { CriterioOrdine, StatoVoce } from "@/lib/database-elenco";

/**
 * I nomi delle classi di stile legate ai tre criteri e agli stati, scritti per intero: ogni criterio ha il suo colore (affidabilità verde, match
 * oro, recensioni terracotta) e un nome sbagliato si vedrebbe subito come errore di tipo. Solo nomi: gli stili stanno in globals.css.
 */
export const CLASSE_PULSANTE_CRITERIO: Record<CriterioOrdine, string> = {
  affidabilita: "db-crit-affidabilita",
  match: "db-crit-match",
  recensioni: "db-crit-recensioni",
};

export const CLASSE_NUMERINO: Record<CriterioOrdine, string> = {
  affidabilita: "db-numerino-affidabilita",
  match: "db-numerino-match",
  recensioni: "db-numerino-recensioni",
};

export const CLASSE_TESSERA: Record<CriterioOrdine, string> = {
  affidabilita: "db-tessera-affidabilita",
  match: "db-tessera-match",
  recensioni: "db-tessera-recensioni",
};

export const CLASSE_STATO: Record<StatoVoce, string> = {
  da_valutare: "db-stato-da_valutare",
  possibile: "db-stato-possibile",
  match: "db-stato-match",
  scartato: "db-stato-scartato",
  ritirato: "db-stato-ritirato",
};

/** Il cerchietto accanto a una verifica o a un criterio: sì (verde), no (terracotta), non disponibile (grigio). */
export const CLASSE_ESITO = {
  si: "db-esito-si",
  no: "db-esito-no",
  nd: "db-esito-nd",
} as const;
