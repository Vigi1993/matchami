export type AffidabilitaInput = {
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  professione: string | null;
  reddito_mensile: number | null;
  mediaRecensioni: number | null; // null se nessuna recensione ancora
  numeroRecensioni: number;
};

export type AffidabilitaResult = {
  punteggio: number;
  label: "Da costruire" | "Buona" | "Molto buona" | "Eccellente";
  hasRecensioni: boolean;
  checks: { ok: boolean; label: string }[];
};

export function computeAffidabilita(p: AffidabilitaInput): AffidabilitaResult {
  const hasRecensioni = p.numeroRecensioni > 0;

  let punteggio = 45; // base, prima di qualunque verifica
  if (p.verificato) punteggio += 20;
  if (p.protestato === false) punteggio += 15;
  if (p.protestato === true) punteggio -= 30;
  if (p.garante === true || p.fideiussione === true) punteggio += 10;
  if (hasRecensioni && p.mediaRecensioni !== null) {
    punteggio += Math.round((p.mediaRecensioni - 3) * 6);
  }
  punteggio = Math.max(5, Math.min(99, Math.round(punteggio)));

  let label: AffidabilitaResult["label"] = "Da costruire";
  if (punteggio >= 85) label = "Eccellente";
  else if (punteggio >= 70) label = "Molto buona";
  else if (punteggio >= 50) label = "Buona";

  const checks = [
    {
      ok: !!p.professione,
      label: p.professione || "Situazione lavorativa da indicare",
    },
    {
      ok: !!p.reddito_mensile,
      label: p.reddito_mensile
        ? `Reddito dichiarato €${p.reddito_mensile.toLocaleString("it-IT")}/mese`
        : "Reddito da indicare",
    },
    {
      ok: p.verificato,
      label: p.verificato
        ? "Reddito verificato"
        : "Verifica reddito non ancora effettuata",
    },
    {
      ok: p.protestato === false,
      label:
        p.protestato === null
          ? "Controllo protesti da avviare"
          : p.protestato
            ? "Segnalazioni in centrale rischi"
            : "Nessun protesto o segnalazione",
    },
    {
      ok: p.garante === true || p.fideiussione === true,
      label:
        p.garante || p.fideiussione
          ? "Garante o fideiussione disponibile"
          : "Nessun garante indicato",
    },
  ];

  return { punteggio, label, hasRecensioni, checks };
}

export type CompletenessInput = {
  hasZone: boolean;
  professione: string | null;
  reddito_mensile: number | null;
  garante: boolean | null;
  animali: boolean | null;
  presentazione: string | null;
  nucleo: string | null;
  fideiussione: boolean | null;
};

export function computeProfileCompleteness(p: CompletenessInput): number {
  const fields = [
    p.hasZone,
    !!p.professione,
    !!p.reddito_mensile,
    p.garante !== null,
    p.animali !== null,
    (p.presentazione ?? "").trim().length > 10,
    p.nucleo !== null,
    p.fideiussione !== null,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
