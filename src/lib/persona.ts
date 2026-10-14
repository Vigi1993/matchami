/**
 * Il nome di una persona, per le intestazioni: nome e cognome insieme, le iniziali per l'avatar. Logica pura: i valori
 * mancanti, vuoti o fatti di soli spazi non rompono niente.
 */
const pulito = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** «Tina Rossi»; se manca uno dei due, l'altro; se mancano entrambi, una stringa vuota. */
export function nomeCompleto(nome: unknown, cognome: unknown): string {
  return [pulito(nome), pulito(cognome)].filter(Boolean).join(" ");
}

/**
 * Le iniziali per l'avatar: la prima lettera del nome e quella del cognome («TR»); con una parte sola, le sue prime due
 * lettere («TI»); senza niente, «?». Sempre maiuscole.
 */
export function iniziali(nome: unknown, cognome: unknown): string {
  const n = Array.from(pulito(nome));
  const c = Array.from(pulito(cognome));
  if (n.length > 0 && c.length > 0) return (n[0] + c[0]).toUpperCase();
  const solo = n.length > 0 ? n : c;
  return solo.length > 0 ? solo.slice(0, 2).join("").toUpperCase() : "?";
}
