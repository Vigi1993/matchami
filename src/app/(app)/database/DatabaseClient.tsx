"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { IconPersone } from "@/components/icons";
import { BadgeRaccomandato } from "@/components/BadgeRaccomandato";
import { PossibiliMatch } from "@/components/PossibiliMatch";
import { RicercaCandidati } from "@/components/RicercaCandidati";
import { SchedaPersona } from "@/components/SchedaPersona";
import { SezioneApribile } from "@/components/SezioneApribile";
import { stelleTesto, testoRecensioni } from "@/lib/recensioni";
import { MOTIVI_RIFIUTO } from "@/lib/motivi-rifiuto";
import type { ChiaveMotivoRifiuto } from "@/lib/motivi-rifiuto";
import { azioniPerStato } from "@/lib/decisioni";
import { conteggiGruppo, datiSchedaCandidato, raggruppaPerAnnuncio, type CasaDatabase, type GruppoAnnuncio } from "@/lib/database-proprietario";
import { testoPrezzo } from "@/lib/proprietario/home";
import type { PossibiliPerCasa } from "@/lib/proprietario/possibili-server";
import type { CandidaturaRicevuta } from "@/lib/types";
import { FILTRI_VUOTI, TESTO_NESSUN_RISULTATO, filtraCandidature, filtriValidi, haPunteggi, numeroFiltriAttivi, opzioniAnnunci, type Filtri } from "@/lib/ricerca-candidati";
import { riapriCandidatura, valutaCandidatura } from "./actions";

const SIMBOLO = { ok: "✓", no: "–", non_indicato: "?" } as const;

type Stato = "in_attesa" | "accettata" | "rifiutata";
type Dialogo = { tipo: "match" | "scarta" | "annulla_match"; c: CandidaturaRicevuta };

/**
 * Il Database inquilini: diviso per CASA. Dentro ogni casa tre sezioni: le candidature spontanee (chi si è candidato da solo),
 * i possibili match (chi cerca una casa come la tua ma non si è candidato) e i già valutati (match e scartati). Ogni persona ha
 * la sua scheda con i pulsanti giusti: «Fai match» e «Scarta» per chi aspetta, «Apri chat» e «Annulla match» per chi è un match,
 * «Annulla scarto» per chi è stato scartato. In fondo la ricerca.
 */
export function DatabaseClient({
  candidature,
  case_ = [],
  possibili = [],
}: {
  candidature: CandidaturaRicevuta[];
  /** le case del proprietario, con la prima foto */
  case_?: CasaDatabase[];
  /** per ogni casa che gli inquilini vedono: quanti cercano una casa come quella, chi si può contattare, le richieste mandate */
  possibili?: PossibiliPerCasa[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaRicevuta | null>(null);
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [motivo, setMotivo] = useState<ChiaveMotivoRifiuto | null>(null);
  // Lo stato che il proprietario ha appena dato (finché la pagina si ricarica con i dati nuovi)
  const [aggiornate, setAggiornate] = useState<Record<string, Stato>>({});
  const [avviso, setAvviso] = useState<{ testo: string; chat?: string } | null>(null);
  // La ricerca e i filtri restano in questa pagina: non si salvano né si inviano.
  const [filtriScelti, setFiltriScelti] = useState<Filtri>(FILTRI_VUOTI);

  const stato = (c: CandidaturaRicevuta): string => aggiornate[c.id] ?? c.status;

  function chiudiDialogo() {
    setDialogo(null);
    setErrore(null);
    setMotivo(null);
  }
  function apriDialogo(tipo: Dialogo["tipo"], c: CandidaturaRicevuta) {
    setErrore(null);
    setMotivo(null);
    setSelezionata(null);
    setDialogo({ tipo, c });
  }

  function dopo(c: CandidaturaRicevuta, nuovo: Stato, testo: string, chat?: string) {
    setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
    setAvviso({ testo, chat });
  }

  function conferma() {
    if (!dialogo) return;
    const { tipo, c } = dialogo;
    const nome = datiSchedaCandidato(c).nome;
    setErrore(null);
    startTransition(async () => {
      if (tipo === "annulla_match") {
        const r = await riapriCandidatura(c.id);
        if (!r.ok) return setErrore(r.error);
        dopo(c, "in_attesa", `Match annullato: ${nome} è di nuovo tra le candidature da valutare.`);
      } else {
        const res = await valutaCandidatura(c.id, tipo === "match" ? "accettata" : "rifiutata", tipo === "scarta" ? (motivo ?? undefined) : undefined);
        if (res?.error) return setErrore(res.error);
        if (tipo === "match") dopo(c, "accettata", `Match fatto con ${nome}: ora potete scrivervi.`, `/chat/${c.id}`);
        else dopo(c, "rifiutata", `Hai scartato ${nome}: se cambi idea, puoi annullare lo scarto.`);
      }
      chiudiDialogo();
    });
  }

  function annullaScarto(c: CandidaturaRicevuta) {
    setErrore(null);
    startTransition(async () => {
      const r = await riapriCandidatura(c.id);
      if (!r.ok) return setAvviso({ testo: r.error });
      dopo(c, "in_attesa", `Scarto annullato: ${datiSchedaCandidato(c).nome} è di nuovo tra le candidature da valutare.`);
    });
  }

  // ---- i gruppi, per casa ----
  const gruppi = raggruppaPerAnnuncio({ case_, candidature, possibili, stato });
  const totaleDaValutare = gruppi.reduce((s, g) => s + g.spontanei.length, 0);
  const totalePossibili = gruppi.reduce((s, g) => s + conteggiGruppo(g).possibili, 0);
  const primoConPossibili = gruppi.find((g) => g.possibili !== null)?.casa.id ?? null;

  // ---- ricerca: sta in fondo, e mostra i suoi risultati sotto la barra ----
  const filtri = filtriValidi(filtriScelti, candidature);
  const visibili = filtraCandidature(candidature, filtri, stato);
  const cercando = numeroFiltriAttivi(filtri) > 0;

  /** I pulsanti di una candidatura, secondo il suo stato */
  function azioni(c: CandidaturaRicevuta) {
    const a = azioniPerStato(stato(c));
    return (
      <>
        {a.faiMatch && (
          <button type="button" className="opp-cta persona-primario" disabled={pending} onClick={() => apriDialogo("match", c)}>
            Fai match
          </button>
        )}
        {a.apriChat && (
          <Link href={`/chat/${c.id}`} className="opp-cta persona-primario block text-center">
            Apri chat
          </Link>
        )}
        {a.scarta && (
          <button type="button" className="richieste-secondario persona-secondario" disabled={pending} onClick={() => apriDialogo("scarta", c)}>
            Scarta
          </button>
        )}
        {a.annullaMatch && (
          <button type="button" className="richieste-secondario persona-secondario" disabled={pending} onClick={() => apriDialogo("annulla_match", c)}>
            Annulla match
          </button>
        )}
        {a.annullaScarto && (
          <button type="button" className="richieste-secondario persona-secondario" disabled={pending} onClick={() => annullaScarto(c)}>
            Annulla scarto
          </button>
        )}
      </>
    );
  }

  function scheda(c: CandidaturaRicevuta) {
    const s = stato(c);
    const etichetta = s === "accettata" ? { testo: "Match fatto", tono: "ok" as const } : s === "rifiutata" ? { testo: "Scartato", tono: "no" as const } : s === "ritirata" ? { testo: "Ha ritirato la candidatura", tono: "neutro" as const } : null;
    return (
      <SchedaPersona dati={datiSchedaCandidato(c)} stato={etichetta} onApri={() => setSelezionata(c)}>
        {azioni(c)}
      </SchedaPersona>
    );
  }

  function casa(g: GruppoAnnuncio) {
    const n = conteggiGruppo(g);
    const zona = g.casa.zona.replace(", Milano", "");
    return (
      <article className="gruppo-casa" aria-label={`Casa: ${g.casa.titolo}`}>
        <header className="gruppo-testa">
          {g.casa.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.casa.foto} alt="" className="gruppo-foto" />
          ) : (
            <span className="gruppo-foto gruppo-foto-vuota" aria-hidden="true" />
          )}
          <div className="gruppo-titolo">
            <h2>{g.casa.titolo}</h2>
            <span>
              {[zona, g.casa.prezzo ? testoPrezzo(g.casa.prezzo) : ""].filter(Boolean).join(" · ")}
            </span>
          </div>
        </header>

        <SezioneApribile titolo="Candidature spontanee" conteggio={n.daValutare} vuoto="Nessuno si è ancora candidato a questa casa.">
          {g.spontanei.length > 0 && (
            <ul className="schede-lista">
              {g.spontanei.map((c) => (
                <li key={c.id}>
                  {scheda(c)}
                </li>
              ))}
            </ul>
          )}
        </SezioneApribile>

        {g.possibili !== null && (
          <SezioneApribile id={g.casa.id === primoConPossibili ? "possibili" : undefined} titolo="Possibili match" conteggio={n.possibili}>
            <PossibiliMatch casa={g.possibili} />
          </SezioneApribile>
        )}

        <SezioneApribile titolo="Già valutati" conteggio={n.valutati} aperta={n.daValutare === 0 && n.possibili === 0} vuoto="Quando fai un match o scarti qualcuno, lo trovi qui.">
          {g.match.length > 0 && (
            <>
              <h3 className="sotto-titolo">Match</h3>
              <ul className="schede-lista">
                {g.match.map((c) => (
                  <li key={c.id}>
                    {scheda(c)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {g.scartati.length > 0 && (
            <>
              <h3 className="sotto-titolo">Scartati</h3>
              <ul className="schede-lista">
                {g.scartati.map((c) => (
                  <li key={c.id}>
                    {scheda(c)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {g.ritirati.length > 0 && (
            <>
              <h3 className="sotto-titolo">Hanno ritirato la candidatura</h3>
              <ul className="schede-lista">
                {g.ritirati.map((c) => (
                  <li key={c.id}>
                    {scheda(c)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </SezioneApribile>
      </article>
    );
  }

  return (
    <PageContainer wide>
      <h1 className="screen-title">Database inquilini</h1>
      <p className="screen-sub">
        {candidature.length === 0 && totalePossibili === 0
          ? "Le candidature e i possibili match delle tue case arrivano qui."
          : `${totaleDaValutare} candidatur${totaleDaValutare === 1 ? "a" : "e"} da valutare · ${totalePossibili} possibil${totalePossibili === 1 ? "e match" : "i match"}.`}
      </p>

      {avviso && (
        <div className="possibili-avviso" role="status">
          {avviso.testo}
          {avviso.chat && (
            <Link href={avviso.chat} className="richieste-link">
              Apri la chat ›
            </Link>
          )}
        </div>
      )}

      {gruppi.length === 0 && (
        <div className="empty-inline">
          <IconPersone className="icon-empty" />
          <h3>Ancora nessuna casa da mostrare</h3>
          <p>Appena una tua casa sarà pubblicata, qui vedrai chi si candida e chi potrebbe fare al caso tuo.</p>
        </div>
      )}

      {gruppi.map((g) => (
        <Fragment key={g.casa.id}>{casa(g)}</Fragment>
      ))}

      {/* ---- la ricerca sta in fondo ---- */}
      {candidature.length > 0 && (
        <section className="ricerca-fondo" aria-label="Cerca tra i candidati">
          <h2 className="ricerca-fondo-titolo">Cerca tra i candidati</h2>
          <RicercaCandidati
            filtri={filtri}
            onCambia={setFiltriScelti}
            annunci={opzioniAnnunci(candidature)}
            conPunteggi={haPunteggi(candidature)}
            visibili={visibili.length}
            totale={candidature.length}
          />
          {cercando && visibili.length === 0 && (
            <div className="empty-inline">
              <IconPersone className="icon-empty" />
              <h3>{TESTO_NESSUN_RISULTATO}</h3>
              <button type="button" className="redo-link" onClick={() => setFiltriScelti(FILTRI_VUOTI)}>
                Azzera filtri
              </button>
            </div>
          )}
          {cercando && visibili.length > 0 && (
            <ul className="schede-lista" aria-label="Risultati della ricerca">
              {visibili.map((c) => (
                <li key={c.id}>
                  <p className="risultato-casa">{c.listings?.titolo ?? "Annuncio"}</p>
                  {scheda(c)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- la scheda completa ---- */}
      <Sheet open={selezionata !== null} onClose={() => setSelezionata(null)} title={selezionata ? `${selezionata.nome ?? "Inquilino"} ${selezionata.cognome ?? ""}` : "Candidatura"}>
        {selezionata && (
          <>
            {selezionata.tenant_profiles?.avatar_url && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selezionata.tenant_profiles.avatar_url}
                  alt={`Foto di ${selezionata.nome ?? "inquilino"}`}
                  className="w-24 h-24 rounded-full object-cover"
                />
              </div>
            )}

            <p className="sheet-sub">
              Candidatura per <b>{selezionata.listings?.titolo}</b>
            </p>

            {selezionata.valutazione && (
              <PercheMatchProprietario valutazione={selezionata.valutazione} />
            )}

            <DettaglioRow
              label="Situazione lavorativa"
              value={selezionata.tenant_profiles?.professione ?? "—"}
            />
            <DettaglioRow
              label="Reddito dichiarato"
              value={
                selezionata.tenant_profiles?.reddito_mensile
                  ? `€${selezionata.tenant_profiles.reddito_mensile.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Reddito del nucleo"
              value={
                selezionata.tenant_profiles?.reddito_nucleo
                  ? `€${selezionata.tenant_profiles.reddito_nucleo.toLocaleString("it-IT")}/mese`
                  : "Non indicato"
              }
            />
            <DettaglioRow
              label="Reddito verificato"
              value={selezionata.tenant_profiles?.verificato ? "Sì" : "No"}
            />
            {selezionata.valutazione && (
              <DettaglioRow
                label="Affidabilità"
                value={`${selezionata.valutazione.affidabilita}/100`}
              />
            )}
            {/* il badge: due recensioni positive da due proprietari diversi (le valutazioni vecchie non lo hanno) */}
            {selezionata.valutazione?.raccomandato === true && (
              <div className="feat-row">
                <span className="k">Inquilino raccomandato</span>
                <span className="v">
                  <BadgeRaccomandato compatto />
                </span>
              </div>
            )}
            {/* le recensioni stanno a parte dal punteggio; le valutazioni vecchie non le hanno */}
            {selezionata.valutazione?.recensioni && (
              <DettaglioRow
                label="Recensioni"
                value={
                  selezionata.valutazione.recensioni.numero > 0
                    ? `${stelleTesto(selezionata.valutazione.recensioni.media)} ${testoRecensioni(selezionata.valutazione.recensioni)}`
                    : testoRecensioni(selezionata.valutazione.recensioni)
                }
              />
            )}
            {selezionata.tenant_profiles?.presentazione && (
              <div style={{ marginTop: 18 }}>
                <div className="pref-label">
                  <span>Presentazione</span>
                </div>
                <p className="note-box" style={{ marginTop: 0, fontStyle: "italic" }}>
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            <div className="persona-azioni" style={{ marginTop: 18 }}>
              {azioni(selezionata)}
            </div>
          </>
        )}
      </Sheet>

      {/* ---- le conferme: fai match, scarta, annulla match ---- */}
      <Sheet
        open={dialogo !== null}
        onClose={chiudiDialogo}
        title={
          dialogo
            ? dialogo.tipo === "match"
              ? `Fai match con ${datiSchedaCandidato(dialogo.c).nome}?`
              : dialogo.tipo === "scarta"
                ? `Perché scarti ${datiSchedaCandidato(dialogo.c).nome}?`
                : `Annullare il match con ${datiSchedaCandidato(dialogo.c).nome}?`
            : "Conferma"
        }
      >
        {dialogo && (
          <>
            {dialogo.tipo === "match" && (
              <>
                <p className="conferma-testo">Si apre la chat e la persona riceve una notifica. Se cambi idea, potrai annullare il match.</p>
                {dialogo.c.valutazione?.match.bloccato && (
                  <div className="note-stop">Attenzione: non soddisfa un criterio obbligatorio che hai chiesto ({dialogo.c.valutazione.match.mancanti.join(", ")}).</div>
                )}
              </>
            )}
            {dialogo.tipo === "scarta" && (
              <>
                <p className="conferma-testo">La persona leggerà il motivo che scegli. Se cambi idea, potrai annullare lo scarto.</p>
                <div className="chip-row" style={{ marginBottom: 16 }}>
                  {MOTIVI_RIFIUTO.map((m) => (
                    <Chip key={m.chiave} label={m.scelta} active={motivo === m.chiave} onClick={() => setMotivo(m.chiave)} />
                  ))}
                </div>
              </>
            )}
            {dialogo.tipo === "annulla_match" && (
              <p className="conferma-testo">
                La chat si chiude e la persona riceve un avviso: la candidatura torna tra quelle da valutare. I messaggi non si perdono. Se c&apos;è già un contratto o una
                visita in programma, il match non si può annullare.
              </p>
            )}
            {errore && (
              <p className="note-error" role="alert">
                {errore}
              </p>
            )}
            <div className="possibili-conferma">
              <button
                type="button"
                className="opp-cta"
                disabled={pending || (dialogo.tipo === "scarta" && motivo === null)}
                style={dialogo.tipo === "scarta" && motivo ? { background: "var(--clay)" } : undefined}
                onClick={conferma}
              >
                {pending ? "Un momento..." : dialogo.tipo === "match" ? "Sì, fai match" : dialogo.tipo === "scarta" ? "Conferma lo scarto" : "Sì, annulla il match"}
              </button>
              <button type="button" className="richieste-secondario" disabled={pending} onClick={chiudiDialogo}>
                No, torna indietro
              </button>
            </div>
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}

// ------------------------------------------------------------

/**
 * "Perché vedi questo numero", dal lato del proprietario: i criteri che ha
 * chiesto, quali il candidato soddisfa, e se qualcuno obbligatorio manca.
 */
export function PercheMatchProprietario({
  valutazione,
}: {
  valutazione: NonNullable<CandidaturaRicevuta["valutazione"]>;
}) {
  const { match, congelata } = valutazione;

  if (match.punteggio === null) {
    return (
      <div className="note-box" style={{ marginTop: 0, marginBottom: 18 }}>
        Per questo annuncio non hai chiesto nessun criterio, quindi non c&apos;è
        una percentuale. Puoi aggiungerli da Immobili.
      </div>
    );
  }

  return (
    <div className="match-box">
      <div className="match-box-top">
        <div className="match-box-pct">{match.punteggio}%</div>
        <div>
          <div className="match-box-label">{match.etichetta}</div>
          <div className="match-box-sub">
            {congelata
              ? "Fotografia al momento della tua decisione"
              : "Sui criteri che hai chiesto, con i dati attuali"}
          </div>
        </div>
      </div>

      {match.bloccato && (
        <div className="note-stop">
          Non soddisfa un criterio obbligatorio: {match.mancanti.join(", ")}.
        </div>
      )}

      <div className="perche-lista">
        {match.criteri.map((c) => (
          <div key={c.chiave} className={`perche-row ${c.stato}`}>
            <span className="perche-simbolo">{SIMBOLO[c.stato]}</span>
            <span className="perche-testo">
              {c.etichetta}
              {c.obbligatorio && <em className="tag-obbl">obbligatorio</em>}
              {c.dettaglio && <small>{c.dettaglio}</small>}
              {c.stato === "non_indicato" && <small>Non indicato dal candidato</small>}
            </span>
          </div>
        ))}
      </div>

      {match.incompleto && !congelata && (
        <p className="field-note" style={{ marginTop: 8 }}>
          Il candidato non ha indicato alcuni dati: se li compila, la
          percentuale può salire.
        </p>
      )}
      <p className="field-note" style={{ marginTop: 8 }}>
        È una compatibilità sui dati dichiarati dal candidato, non una
        valutazione della persona né una previsione.
      </p>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feat-row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
