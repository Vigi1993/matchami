import { clienteAmministratore } from "@/lib/supabase/admin";
import { annuncioDaRiga, contaPossibiliInquilini, type AnnuncioDaConfrontare, type RicercaInquilino } from "@/lib/match/possibili";
import { mappaLuoghi, type Luogo } from "@/lib/luoghi";
import { criteriDaRighe, type RigaCriterioDb } from "@/lib/match";
import type { RigaInteresse, RigaZona } from "@/lib/match";
import { ricercaInLinea, schedeInquilini, nomeBreve, type InquilinoDisponibile, type SchedaInquilino } from "@/lib/proprietario/possibili-inquilini";
import type { RecensioneGrezza } from "@/lib/recensioni";
import type { StatoRichiesta } from "@/lib/richieste";
import type { createClient } from "@/lib/supabase/server";

/**
 * SOLO SUL SERVER. Legge le ricerche degli inquilini con la chiave di servizio (il proprietario non può leggerle: la sicurezza
 * a livello di riga lo vieta). Cosa esce da qui:
 *   - per ogni casa, un NUMERO: quanti inquilini cercano una casa come quella (tutti, anche chi non si è reso disponibile);
 *   - per ogni casa, le SCHEDE di chi si è reso disponibile a essere contattato (consenso), ha una ricerca in linea con la casa
 *     e rispetta i criteri obbligatori: nome e iniziale, lavoro, foto, estratto della presentazione, affidabilità, recensioni.
 *     Niente reddito, niente contatti.
 * I dati personali (nome, lavoro, recensioni…) si leggono SOLO per chi ha dato il consenso E ha una ricerca in linea: per tutti
 * gli altri si leggono solo i criteri di ricerca.
 *
 * Se la chiave di servizio non c'è, o una domanda non riesce, restituisce `null`/nessuna scheda: la Home e il Database non
 * mostrano il numero né le schede (meglio niente che un dato sbagliato) e il resto funziona.
 *
 * Il limite sul numero di ricerche lette è un limite di scala: oltre, i numeri sarebbero per difetto. Quando ci si arriva, il
 * conteggio va spostato nel database.
 */
export const MAX_RICERCHE_LETTE = 5000;
const A_BLOCCHI = 100;

type RicercaLetta = RicercaInquilino & { visibile: boolean };
type Admin = NonNullable<ReturnType<typeof clienteAmministratore>>;

/** Le ricerche di tutti gli inquilini, con il consenso a farsi trovare. Solo criteri di ricerca: nient'altro. */
async function leggiRicerche(admin: Admin): Promise<RicercaLetta[] | null> {
  const [tenant, zone, interessi] = await Promise.all([
    admin
      .from("tenant_profiles")
      .select("profile_id, visibile_ai_proprietari, budget_max, locali_min, mq_min, budget_min, locali_max, mq_max, tipologia")
      .limit(MAX_RICERCHE_LETTE),
    admin.from("tenant_zone_interesse").select("tenant_id, zona, luogo_id").limit(MAX_RICERCHE_LETTE * 20),
    admin.from("tenant_interessi").select("tenant_id, attributo_key, peso, valore, necessaria").limit(MAX_RICERCHE_LETTE * 40),
  ]);
  if (tenant.error || zone.error || interessi.error) {
    console.error("leggiRicerche: lettura non riuscita:", tenant.error?.message ?? zone.error?.message ?? interessi.error?.message);
    return null;
  }

  const zonePer = new Map<string, RigaZona[]>();
  for (const z of zone.data ?? []) {
    const id = z.tenant_id as string;
    zonePer.set(id, [...(zonePer.get(id) ?? []), { zona: z.zona as string, luogo_id: (z.luogo_id as string | null) ?? null }]);
  }
  const interessiPer = new Map<string, RigaInteresse[]>();
  for (const i of interessi.data ?? []) {
    const id = i.tenant_id as string;
    interessiPer.set(id, [
      ...(interessiPer.get(id) ?? []),
      { attributo_key: i.attributo_key as string, peso: i.peso as number, valore: i.valore, necessaria: (i.necessaria as boolean | null) ?? null },
    ]);
  }

  return (tenant.data ?? []).map((t) => ({
    tenantId: t.profile_id as string,
    visibile: t.visibile_ai_proprietari === true,
    riga: {
      budget_max: (t.budget_max as number | null) ?? null,
      locali_min: (t.locali_min as number | null) ?? null,
      mq_min: (t.mq_min as number | null) ?? null,
      budget_min: (t.budget_min as number | null) ?? null,
      locali_max: (t.locali_max as number | null) ?? null,
      mq_max: (t.mq_max as number | null) ?? null,
      tipologia: (t.tipologia as string | null) ?? null,
    },
    zone: zonePer.get(t.profile_id as string) ?? [],
    interessi: interessiPer.get(t.profile_id as string) ?? [],
  }));
}

export async function possibiliPerAnnuncio(
  annunci: readonly AnnuncioDaConfrontare[],
  giaCandidati: ReadonlyMap<string, ReadonlySet<string>>
): Promise<Map<string, number> | null> {
  if (annunci.length === 0) return new Map();
  const admin = clienteAmministratore();
  if (!admin) return null;
  const ricerche = await leggiRicerche(admin);
  if (!ricerche) return null;
  return contaPossibiliInquilini({ annunci, ricerche, giaCandidati });
}

export type RichiestaInviata = {
  id: string;
  stato: StatoRichiesta;
  /** il nome si dà solo finché la richiesta è in attesa; dopo un rifiuto non si dice chi è */
  nome: string | null;
  candidaturaId: string | null;
  creataIl: string;
};

export type PossibiliPerCasa = {
  id: string;
  titolo: string;
  zona: string;
  /** quanti inquilini cercano una casa come questa (tutti, anche chi non si è reso disponibile); `null` = non si sa */
  possibili: number | null;
  /** chi si è reso disponibile e si può contattare; `null` = non si sa */
  disponibili: SchedaInquilino[] | null;
  /** le richieste già mandate per questa casa */
  richieste: RichiestaInviata[];
};

function inBlocchi<T>(lista: readonly T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

/**
 * Per ogni casa del proprietario che gli inquilini vedono (verificata e pubblicata): il numero di chi cerca una casa come
 * quella, le schede di chi si può contattare e le richieste già mandate. Il client del PROPRIETARIO legge le sue case, i suoi
 * criteri e le sue richieste; quello di servizio serve solo per le ricerche e per le schede di chi ha dato il consenso.
 */
export async function possibiliPerCasaDelProprietario(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PossibiliPerCasa[]> {
  const [{ data: case_ }, { data: candidature }, { data: luoghiRighe }, { data: richieste }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, titolo, zona, prezzo, locali, mq, attributi, classe_energetica, luogo_id, tipologia, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal")
      .eq("owner_id", userId)
      .eq("pubblicato", true)
      .eq("verifica_stato", "verificato")
      .order("created_at", { ascending: false }),
    supabase.from("candidature").select("listing_id, tenant_id, listings!inner(owner_id)").eq("listings.owner_id", userId),
    supabase.from("luoghi").select("id, livello, nome, sigla, parent_id"),
    supabase.from("richieste_proprietari").select("id, listing_id, tenant_id, stato, candidatura_id, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
  ]);

  const righe = case_ ?? [];
  const ids = righe.map((l) => l.id as string);
  const { data: righeCriteri } = ids.length > 0 ? await supabase.from("listing_criteri").select("listing_id, chiave, peso, modo, soglia_pct").in("listing_id", ids) : { data: [] };

  const giaCandidati = new Map<string, Set<string>>();
  const aggiungi = (m: Map<string, Set<string>>, listing: string, tenant: string) => {
    const s = m.get(listing) ?? new Set<string>();
    s.add(tenant);
    m.set(listing, s);
  };
  for (const c of candidature ?? []) aggiungi(giaCandidati, c.listing_id as string, c.tenant_id as string);
  const esclusi = new Map<string, Set<string>>();
  for (const [l, s] of giaCandidati) for (const t of s) aggiungi(esclusi, l, t);
  for (const r of richieste ?? []) aggiungi(esclusi, r.listing_id as string, r.tenant_id as string);

  const mappa = mappaLuoghi((luoghiRighe ?? []) as Luogo[]);
  const annunci = righe.map((l) => annuncioDaRiga({ ...(l as Parameters<typeof annuncioDaRiga>[0]), id: l.id as string }, mappa));

  const admin = clienteAmministratore();
  const ricerche = admin ? await leggiRicerche(admin) : null;
  const conteggi = ricerche ? contaPossibiliInquilini({ annunci, ricerche, giaCandidati }) : null;

  // le schede: solo chi ha dato il consenso, ha una ricerca in linea ed è libero (non candidato, non già contattato)
  let schedePer: Map<string, SchedaInquilino[]> | null = null;
  const nomiRichieste = new Map<string, string | null>();
  if (admin && ricerche) {
    const disponibili = ricerche.filter((r) => r.visibile);
    const daLeggere = new Set<string>();
    for (const a of annunci) for (const d of disponibili) if (!esclusi.get(a.id)?.has(d.tenantId) && ricercaInLinea(a.annuncio, d)) daLeggere.add(d.tenantId);
    for (const r of richieste ?? []) if (r.stato === "inviata") daLeggere.add(r.tenant_id as string);

    const profili = new Map<string, { nome: string | null; cognome: string | null }>();
    const dettagli = new Map<string, Record<string, unknown>>();
    const recensioniPer = new Map<string, RecensioneGrezza[]>();
    let riuscito = true;
    for (const blocco of inBlocchi([...daLeggere], A_BLOCCHI)) {
      const [p, t, r] = await Promise.all([
        admin.from("profiles").select("id, nome, cognome").in("id", blocco),
        admin
          .from("tenant_profiles")
          .select("profile_id, visibile_ai_proprietari, professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, animali, nucleo, presentazione, verificato, avatar_url")
          .in("profile_id", blocco),
        admin.from("recensioni").select("tenant_id, voto, autore_id, created_at").in("tenant_id", blocco),
      ]);
      if (p.error || t.error || r.error) {
        console.error("possibiliPerCasaDelProprietario: lettura non riuscita:", p.error?.message ?? t.error?.message ?? r.error?.message);
        riuscito = false;
        break;
      }
      for (const x of p.data ?? []) profili.set(x.id as string, { nome: (x.nome as string | null) ?? null, cognome: (x.cognome as string | null) ?? null });
      for (const x of t.data ?? []) dettagli.set(x.profile_id as string, x);
      for (const x of r.data ?? []) {
        const id = x.tenant_id as string;
        recensioniPer.set(id, [...(recensioniPer.get(id) ?? []), { voto: x.voto, autore_id: x.autore_id, created_at: x.created_at }]);
      }
    }

    if (riuscito) {
      const completi: InquilinoDisponibile[] = [];
      for (const d of disponibili) {
        const det = dettagli.get(d.tenantId);
        // il consenso si ricontrolla sulla riga letta: senza, non si mostra
        if (!det || det.visibile_ai_proprietari !== true) continue;
        const pr = profili.get(d.tenantId);
        completi.push({
          tenantId: d.tenantId,
          nome: pr?.nome ?? null,
          cognome: pr?.cognome ?? null,
          professione: (det.professione as string | null) ?? null,
          avatarUrl: (det.avatar_url as string | null) ?? null,
          presentazione: (det.presentazione as string | null) ?? null,
          verificato: det.verificato === true,
          protestato: (det.protestato as boolean | null) ?? null,
          garante: (det.garante as boolean | null) ?? null,
          fideiussione: (det.fideiussione as boolean | null) ?? null,
          reddito_mensile: (det.reddito_mensile as number | null) ?? null,
          reddito_nucleo: (det.reddito_nucleo as number | null) ?? null,
          animaliCompilato: det.animali !== null && det.animali !== undefined,
          nucleoCompilato: det.nucleo !== null && det.nucleo !== undefined,
          riga: d.riga,
          zone: d.zone,
          interessi: d.interessi,
          recensioni: recensioniPer.get(d.tenantId) ?? [],
        });
      }
      const criteriPer = new Map<string, RigaCriterioDb[]>();
      for (const c of righeCriteri ?? []) {
        const id = c.listing_id as string;
        criteriPer.set(id, [...(criteriPer.get(id) ?? []), c as unknown as RigaCriterioDb]);
      }
      schedePer = new Map();
      righe.forEach((l, i) => {
        const id = l.id as string;
        schedePer!.set(id, schedeInquilini({ annuncio: annunci[i].annuncio, canone: l.prezzo as number, criteri: criteriDaRighe(criteriPer.get(id) ?? null), disponibili: completi, esclusi: esclusi.get(id) ?? new Set() }));
      });
      for (const r of richieste ?? []) {
        const pr = profili.get(r.tenant_id as string);
        nomiRichieste.set(r.id as string, pr ? nomeBreve(pr.nome, pr.cognome) : null);
      }
    }
  }

  return righe.map((l) => {
    const id = l.id as string;
    return {
      id,
      titolo: l.titolo as string,
      zona: l.zona as string,
      possibili: conteggi?.get(id) ?? null,
      disponibili: schedePer?.get(id) ?? null,
      richieste: (richieste ?? [])
        .filter((r) => r.listing_id === id)
        .map((r) => ({
          id: r.id as string,
          stato: r.stato as StatoRichiesta,
          nome: r.stato === "inviata" ? nomiRichieste.get(r.id as string) ?? null : null,
          candidaturaId: (r.candidatura_id as string | null) ?? null,
          creataIl: r.created_at as string,
        })),
    };
  });
}
