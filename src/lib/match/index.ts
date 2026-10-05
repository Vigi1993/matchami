export * from "./config";
export * from "./tipi";
export { etichettaPer } from "./comuni";
export { calcolaMatchInquilino, ordinaAnnunci } from "./inquilino";
export { haCriteriDiRicerca, preparaMazzo, statoMazzo } from "./mazzo";
export type { Mazzo, StatoMazzo, VoceMazzo } from "./mazzo";
export {
  CATALOGO_CRITERI,
  CHIAVI_CRITERI,
  calcolaMatchProprietario,
  confrontaCandidati,
  ordinaCandidati,
} from "./proprietario";
export type { VoceCandidato } from "./proprietario";
