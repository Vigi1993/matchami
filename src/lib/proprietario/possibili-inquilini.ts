import { computeAffidabilita } from "../affidabilita";
import { statoRaccomandazione, riepilogoRecensioni, type RecensioneGrezza, type RiepilogoRecensioni } from "../recensioni";
import { calcolaMatchInquilino } from "../match/inquilino";
import { haCriteriDiRicerca, profiloRicercaDaRighe, type RigaInteresse, type RigaRicerca, type RigaZona } from "../match/mazzo";
import { valutaCandidato } from "../match/candidato";
import { ordinaCandidati } from "../match/proprietario";
import type { AnnuncioPerMatch, CriterioRichiesto } from "../match";

/**
 * I possibili inquilini di una casa, per il proprietario: chi si è reso disponibile a essere contattato (il consenso si controlla
 * prima di arrivare qui), ha una ricerca in linea con la casa e rispetta i criteri OBBLIGATORI che il proprietario ha chiesto,
 * ordinati dal più adatto.
 *
 * Logica pura. Cosa vede il proprietario di una persona che non si è candidata: il nome di battesimo con l'iniziale del
 * cognome, il lavoro, la foto, un estratto della presentazione, l'affidabilità e le recensioni. Non il reddito, non i dati di
 * contatto. Il resto lo vede solo dopo il match, come per ogni candidato.
 */
export type InquilinoDisponibile = {
  tenantId: string;
  nome: string | null;
  cognome: string | null;
  professione: string | null;
  avatarUrl: string | null;
  presentazione: string | null;
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  reddito_mensile: number | null;
  reddito_nucleo: number | null;
  animaliCompilato: boolean;
  nucleoCompilato: boolean;
  /** la sua ricerca */
  riga: RigaRicerca;
  zone: RigaZona[];
  interessi: RigaInteresse[];
  recensioni: RecensioneGrezza[];
};

export type SchedaInquilino = {
  tenantId: string;
  /** «Anna V.» */
  nome: string;
  professione: string | null;
  avatarUrl: string | null;
  /** un estratto della presentazione, mai più di 160 caratteri */
  presentazione: string | null;
  affidabilita: number;
  etichettaAffidabilita: string;
  raccomandato: boolean;
  recensioni: RiepilogoRecensioni;
  redditoVerificato: boolean;
  /** quanto combacia con i criteri del proprietario, da 0 a 99; `null` se non ne ha chiesto nessuno */
  compatibilita: number | null;
};

const pulito = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** «Anna V.»: il nome e l'iniziale del cognome. Con una parte sola, quella; senza niente, «Un inquilino». */
export function nomeBreve(nome: unknown, cognome: unknown): string {
  const n = pulito(nome);
  const c = Array.from(pulito(cognome))[0];
  if (n && c) return `${n} ${c.toUpperCase()}.`;
  return n || (c ? `${c.toUpperCase()}.` : "Un inquilino");
}

export const LUNGHEZZA_ESTRATTO = 160;

/** Le prime parole della presentazione, tagliate a una parola intera, con i puntini se è più lunga. */
export function estratto(testo: unknown, max: number = LUNGHEZZA_ESTRATTO): string | null {
  const t = pulito(testo);
  if (!t) return null;
  if (t.length <= max) return t;
  const taglio = t.slice(0, max);
  const spazio = taglio.lastIndexOf(" ");
  return (spazio > max * 0.5 ? taglio.slice(0, spazio) : taglio).replace(/[\s,.;:!?-]+$/, "") + "…";
}

/** La casa è in linea con la ricerca di questa persona (la stessa regola della Home dell'inquilino e del conteggio). */
export function ricercaInLinea(annuncio: AnnuncioPerMatch, p: Pick<InquilinoDisponibile, "riga" | "zone" | "interessi">): boolean {
  const profilo = profiloRicercaDaRighe(p.riga, p.zone, p.interessi);
  return haCriteriDiRicerca(profilo) && calcolaMatchInquilino(annuncio, profilo).fascia === "in_ricerca";
}

export function schedeInquilini(input: {
  annuncio: AnnuncioPerMatch;
  canone: number;
  /** i criteri che il proprietario ha chiesto per questa casa */
  criteri: readonly CriterioRichiesto[];
  disponibili: readonly InquilinoDisponibile[];
  /** chi si è già candidato a questa casa e chi ha già ricevuto una richiesta: non si propongono */
  esclusi: ReadonlySet<string>;
  ora?: number;
}): SchedaInquilino[] {
  const voci: { scheda: SchedaInquilino; match: { bloccato: boolean; punteggio: number | null }; affidabilita: number; raccomandato: boolean; recensioni: RiepilogoRecensioni }[] = [];

  for (const d of input.disponibili) {
    if (!d || typeof d.tenantId !== "string" || input.esclusi.has(d.tenantId)) continue;
    if (!ricercaInLinea(input.annuncio, d)) continue;

    const riepilogo = riepilogoRecensioni((d.recensioni ?? []).map((r) => r.voto));
    const raccomandato = statoRaccomandazione(d.recensioni, input.ora).raccomandato;
    const valutazione = valutaCandidato({
      criteri: [...input.criteri],
      canone: input.canone,
      profilo: {
        professione: d.professione,
        reddito_mensile: d.reddito_mensile,
        reddito_nucleo: d.reddito_nucleo,
        garante: d.garante,
        fideiussione: d.fideiussione,
        protestato: d.protestato,
        animali_compilato: d.animaliCompilato === true,
        nucleo_compilato: d.nucleoCompilato === true,
        presentazione: d.presentazione,
        verificato: d.verificato === true,
      },
      recensioni: riepilogo,
      raccomandato,
    });
    // chi non rispetta un criterio OBBLIGATORIO del proprietario non si propone
    if (valutazione.match.bloccato) continue;

    const aff = computeAffidabilita({ verificato: d.verificato === true, protestato: d.protestato, garante: d.garante, fideiussione: d.fideiussione });
    voci.push({
      scheda: {
        tenantId: d.tenantId,
        nome: nomeBreve(d.nome, d.cognome),
        professione: pulito(d.professione) || null,
        avatarUrl: typeof d.avatarUrl === "string" && d.avatarUrl ? d.avatarUrl : null,
        presentazione: estratto(d.presentazione),
        affidabilita: aff.punteggio,
        etichettaAffidabilita: aff.label,
        raccomandato,
        recensioni: riepilogo,
        redditoVerificato: d.verificato === true,
        compatibilita: valutazione.match.punteggio,
      },
      match: { bloccato: false, punteggio: valutazione.match.punteggio },
      affidabilita: aff.punteggio,
      raccomandato,
      recensioni: riepilogo,
    });
  }

  // lo stesso ordine dei candidati: compatibilità, poi il badge, poi l'affidabilità, poi le recensioni
  const ordinati = ordinaCandidati(voci.map((v, i) => ({ id: String(i), match: v.match as never, affidabilita: v.affidabilita, raccomandato: v.raccomandato, recensioni: v.recensioni })));
  return ordinati.map((o) => voci[Number(o.id)].scheda);
}
