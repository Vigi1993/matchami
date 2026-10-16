"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, RISCALDAMENTI, TIPI_CONTRATTO } from "@/lib/constants";
import type { ImmobileDettaglio } from "@/lib/types";
import type { CriterioRichiesto } from "@/lib/match";
import { CriteriCandidati } from "@/components/CriteriCandidati";
import { descriviStato, immobileVerificaDa } from "@/lib/verifica";
import { VerificaImmobile } from "@/components/VerificaImmobile";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { CLASSI_ENERGETICHE } from "@/lib/annunci/energia";
import { PannelloPrezzo } from "@/components/PannelloPrezzo";
import type { RisultatoQuotazione } from "@/lib/prezzi";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { StepperOpzionale } from "@/components/ui/StepperOpzionale";
import { LuogoAutocomplete } from "@/components/LuogoAutocomplete";
import { etichettaLuogo, mappaLuoghi, type Luogo } from "@/lib/luoghi";
import { OPZIONI_PIANO_ANNUNCIO } from "@/lib/annunci/dati-immobile";
import { datiMancanti } from "@/lib/annunci/obbligatori";
import { createClient } from "@/lib/supabase/client";
import { IconPalazzo } from "@/components/icons";
import { VisiteImmobile } from "@/components/VisiteImmobile";
import { IndirizzoImmobile } from "@/components/IndirizzoImmobile";
import type { IndirizzoConVista } from "@/lib/mappe/tipi";
import type { VisitaProprietario } from "@/lib/visite";
import {
  creaImmobile,
  aggiornaImmobile,
  eliminaImmobile,
  type SaveState,
} from "./actions";

export function ImmobiliClient({
  immobili,
  haIdentita = false,
  visite = [],
  indirizzi = {},
  quotazioni = {},
  luoghi = [],
}: {
  immobili: ImmobileDettaglio[];
  /** ha già caricato il documento d'identità (serve per chiedere la verifica di un immobile) */
  haIdentita?: boolean;
  /** i luoghi dove si può mettere un immobile (provincia → città → quartiere) */
  luoghi?: Luogo[];
  /** i posti liberi e le prenotazioni di tutti i miei immobili */
  visite?: VisitaProprietario[];
  /** gli indirizzi dei miei immobili, per identificativo */
  indirizzi?: Record<string, IndirizzoConVista>;
  /** le quotazioni per zona, per il consiglio sul prezzo */
  quotazioni?: Record<string, RisultatoQuotazione>;
}) {
  const [nuovoAperto, setNuovoAperto] = useState(false);
  // si tiene l'identificativo, non la casa: dopo un caricamento la pagina si aggiorna e la scheda deve mostrare i dati nuovi
  const [selezionatoId, setSelezionatoId] = useState<string | null>(null);
  const selezionato = immobili.find((i) => i.id === selezionatoId) ?? null;

  return (
    <PageContainer wide>
      <h1 className="screen-title">I tuoi immobili</h1>
      <p className="screen-sub">
        {immobili.length === 0
          ? "Pubblica il tuo primo immobile per iniziare a ricevere candidature."
          : `${immobili.length} immobil${immobili.length === 1 ? "e" : "i"} pubblicat${immobili.length === 1 ? "o" : "i"}.`}
      </p>

      <button
        onClick={() => setNuovoAperto(true)}
        className="opp-cta"
        style={{ marginBottom: 26 }}
      >
        + Nuovo annuncio
      </button>

      {immobili.length === 0 ? (
        <div className="empty-inline">
          <IconPalazzo className="icon-empty" />
          <h3>Nessun immobile ancora</h3>
          <p>
            Tocca &quot;+ Nuovo annuncio&quot; qui sopra per pubblicare il
            primo.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {immobili.map((im) => (
            <button
              key={im.id}
              onClick={() => setSelezionatoId(im.id)}
              className="match-card"
            >
              {im.foto[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={im.foto[0]} alt="" />
              ) : (
                <div className="mc-avatar">
                  {im.titolo.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="mc-body">
                <div className="mc-zona">{im.zona}</div>
                <div className="mc-title">{im.titolo}</div>
                <div className="mc-meta">
                  €{im.prezzo.toLocaleString("it-IT")}/mese ·{" "}
                  {descriviStato(im.verifica_stato, im.verifica_esito_note).etichetta.toLowerCase()}
                  {!im.pubblicato && " · non pubblicato"}
                </div>
              </div>
              <div
                className={`mc-pct ${
                  im.nCandidature > 0 ? "is-match" : "is-off"
                }`}
              >
                {/* sempre «numero + etichetta piccola»: una scritta lunga schiacciava il nome dell'immobile */}
                {im.nCandidature > 0 || im.pubblicato ? (
                  <>
                    {im.nCandidature}
                    <span>candidatur{im.nCandidature === 1 ? "a" : "e"}</span>
                  </>
                ) : (
                  <>
                    —<span>non pubblicato</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={nuovoAperto}
        onClose={() => setNuovoAperto(false)}
        title="Nuovo annuncio"
      >
        <ImmobileForm
          action={creaImmobile}
          quotazioni={quotazioni}
          luoghi={luoghi}
          onSaved={() => setNuovoAperto(false)}
        />
      </Sheet>

      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionatoId(null)}
        title={selezionato?.titolo ?? "Immobile"}
      >
        {selezionato && (
          <>
            {/* la prova di proprietà: carica la visura o l'atto e chiedi la verifica, senza passare dalla Home */}
            <VerificaImmobile key={selezionato.id} immobile={immobileVerificaDa(selezionato)} haIdentita={haIdentita} conIdentita />
            <IndirizzoImmobile key={selezionato.id} immobileId={selezionato.id} salvato={indirizzi[selezionato.id] ?? null} />
            <VisiteImmobile immobileId={selezionato.id} visite={visite} />
            <ImmobileForm
              action={aggiornaImmobile}
              immobile={selezionato}
              quotazioni={quotazioni}
              luoghi={luoghi}
              onSaved={() => setSelezionatoId(null)}
            />
          </>
        )}
      </Sheet>
    </PageContainer>
  );
}

function ImmobileForm({
  action,
  immobile,
  quotazioni,
  luoghi,
  onSaved,
}: {
  action: (prevState: SaveState, formData: FormData) => Promise<SaveState>;
  immobile?: ImmobileDettaglio;
  quotazioni: Record<string, RisultatoQuotazione>;
  luoghi: Luogo[];
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [erroreDelete, setErroreDelete] = useState<string | null>(null);

  // Dove si trova: un luogo dell'elenco (la zona scritta ne deriva). Un annuncio vecchio può non averne ancora uno.
  const mappa = useMemo(() => mappaLuoghi(luoghi), [luoghi]);
  const [luogoId, setLuogoId] = useState<string | null>(immobile?.luogo_id ?? null);
  const luogo = luogoId ? mappa.get(luogoId) : undefined;
  const zona = luogo ? etichettaLuogo(luogo, mappa) : (immobile?.zona ?? "");
  // I dati che chi cerca può filtrare. Vuoti = «da indicare»: servono tutti per chiedere la verifica.
  const [tipologia, setTipologia] = useState<"appartamento" | "villa">(immobile?.tipologia === "villa" ? "villa" : "appartamento");
  const [bagni, setBagni] = useState(immobile?.bagni ?? 0);
  const [piano, setPiano] = useState(immobile?.piano !== null && immobile?.piano !== undefined ? String(immobile.piano) : "");
  const [riscaldamento, setRiscaldamento] = useState(immobile?.riscaldamento ?? "");
  const [contratto, setContratto] = useState(immobile?.tipo_contratto ?? "");
  const [disponibile, setDisponibile] = useState(immobile?.disponibile_dal ?? "");
  const [prezzo, setPrezzo] = useState(immobile?.prezzo ?? 1200);
  const [locali, setLocali] = useState(immobile?.locali ?? 2);
  const [mq, setMq] = useState(immobile?.mq ?? 50);
  const [classe, setClasse] = useState<string>(immobile?.classe_energetica ?? "");
  const [ep, setEp] = useState<string>(immobile?.ep_globale != null ? String(immobile.ep_globale).replace(".", ",") : "");
  const [attributi, setAttributi] = useState<Record<string, boolean>>(
    immobile?.attributi ?? {}
  );
  const [pubblicato, setPubblicato] = useState(immobile?.pubblicato ?? true);
  const [foto, setFoto] = useState<string[]>(immobile?.foto ?? []);
  const [criteri, setCriteri] = useState<CriterioRichiesto[]>(immobile?.criteri ?? []);
  const mancanti = datiMancanti({
    classe_energetica: classe,
    luogo_id: luogoId,
    bagni: bagni > 0 ? bagni : null,
    piano: piano === "" ? null : Number(piano),
    riscaldamento,
    tipo_contratto: contratto,
    disponibile_dal: disponibile,
  });
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [caricamentoFoto, setCaricamentoFoto] = useState(false);
  const [erroreFoto, setErroreFoto] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setCaricamentoFoto(true);
    setErroreFoto(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErroreFoto("Devi essere autenticato.");
      setCaricamentoFoto(false);
      return;
    }

    const nuove: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) {
        setErroreFoto(`"${file.name}" supera i 10 MB e non è stata caricata.`);
        continue;
      }

      const estensione = file.name.split(".").pop() || "jpg";
      const percorso = `${user.id}/${crypto.randomUUID()}.${estensione}`;

      const { error } = await supabase.storage
        .from("immobili-foto")
        .upload(percorso, file, { upsert: true });

      if (error) {
        setErroreFoto(error.message);
        continue;
      }

      const { data } = supabase.storage
        .from("immobili-foto")
        .getPublicUrl(percorso);
      nuove.push(data.publicUrl);
    }

    setFoto((prec) => [...prec, ...nuove]);
    setCaricamentoFoto(false);
    e.target.value = ""; // permette di ricaricare lo stesso file
  }

  function rimuoviFoto(url: string) {
    setFoto((prec) => prec.filter((u) => u !== url));
  }

  function spostaFoto(url: string, direzione: -1 | 1) {
    setFoto((prec) => {
      const i = prec.indexOf(url);
      const j = i + direzione;
      if (i < 0 || j < 0 || j >= prec.length) return prec;
      const copia = [...prec];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function toggleAttributo(key: string) {
    setAttributi((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function elimina() {
    if (!immobile) return;
    if (!confirm(`Eliminare "${immobile.titolo}"? Non si può annullare.`))
      return;
    startDeleteTransition(async () => {
      const res = await eliminaImmobile(immobile.id);
      if (res?.error) {
        setErroreDelete(res.error);
      } else {
        onSaved();
      }
    });
  }

  // se il salvataggio è andato a buon fine, chiudi lo sheet dopo un attimo
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onSaved, 600);
      return () => clearTimeout(t);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {immobile && <input type="hidden" name="id" value={immobile.id} />}
      <input type="hidden" name="luogo_id" value={luogoId ?? ""} />
      <input type="hidden" name="tipologia" value={tipologia} />
      <input type="hidden" name="bagni" value={bagni > 0 ? bagni : ""} />
      <input type="hidden" name="piano" value={piano} />
      <input type="hidden" name="riscaldamento" value={riscaldamento} />
      <input type="hidden" name="tipo_contratto" value={contratto} />
      <input type="hidden" name="disponibile_dal" value={disponibile} />
      <input type="hidden" name="prezzo" value={prezzo} />
      <input type="hidden" name="locali" value={locali} />
      <input type="hidden" name="mq" value={mq} />
      <input type="hidden" name="classe_energetica" value={classe} />
      <input type="hidden" name="ep_globale" value={ep} />
      <input type="hidden" name="attributi" value={JSON.stringify(attributi)} />
      <input type="hidden" name="pubblicato" value={String(pubblicato)} />
      <input type="hidden" name="foto" value={JSON.stringify(foto)} />
      <input type="hidden" name="criteri" value={JSON.stringify(criteri)} />

      <Field label="Titolo annuncio">
        <input
          name="titolo"
          defaultValue={immobile?.titolo}
          placeholder="Es. Bilocale luminoso ai Navigli"
          className="contract-input"
        />
      </Field>

      <Field label="Descrizione">
        <textarea
          name="descrizione"
          defaultValue={immobile?.descrizione ?? ""}
          rows={3}
          placeholder="Racconta l'immobile: luce, stato, dintorni..."
          className="ob-textarea"
        />
      </Field>

      <Field label="Dove si trova">
        <LuogoAutocomplete
          luoghi={luoghi}
          scelti={luogoId ? [luogoId] : []}
          onChange={(ids) => setLuogoId(ids[0] ?? null)}
          singolo
          livelli={["quartiere", "comune"]}
          etichetta="Dove si trova l'immobile: città o quartiere"
          segnaposto="Scrivi la città o il quartiere"
        />
        {!luogoId && (
          <p className="field-note" style={{ margin: "8px 0 0 0" }}>
            {immobile?.zona ? `Zona attuale: ${immobile.zona}. Scegli dall'elenco per ritrovarla.` : "Scegli la zona dall'elenco: serve per salvare l'annuncio."}
          </p>
        )}
      </Field>

      <Field label={`Canone mensile · €${prezzo.toLocaleString("it-IT")}`}>
        <input
          type="range"
          min={400}
          max={3500}
          step={50}
          value={prezzo}
          onChange={(e) => setPrezzo(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Locali">
        <Stepper value={locali} onChange={setLocali} min={1} max={8} />
      </Field>

      <Field label="Metratura">
        <Stepper value={mq} onChange={setMq} min={15} max={250} step={5} suffix=" m²" />
      </Field>

      <Field label="Tipo di immobile">
        <div className="chip-row" role="group" aria-label="Tipo di immobile">
          <Chip label="Appartamento" active={tipologia === "appartamento"} onClick={() => setTipologia("appartamento")} />
          <Chip label="Villa" active={tipologia === "villa"} onClick={() => setTipologia("villa")} />
          <button type="button" className="chip" disabled aria-label="Posto letto, presto disponibile">
            Posto letto · presto
          </button>
        </div>
      </Field>

      <Field label="Bagni · obbligatorio per la verifica">
        <StepperOpzionale etichetta="Numero di bagni" value={bagni} onChange={setBagni} min={1} max={10} avvio={1} vuoto="Da indicare" />
      </Field>

      <Field label="Piano · obbligatorio per la verifica">
        <select value={piano} onChange={(e) => setPiano(e.target.value)} aria-label="Piano" className="contract-input">
          <option value="">Da indicare</option>
          {OPZIONI_PIANO_ANNUNCIO.map((o) => (
            <option key={o.valore} value={o.valore}>
              {o.etichetta}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Riscaldamento · obbligatorio per la verifica">
        <div className="chip-row" role="group" aria-label="Tipo di riscaldamento">
          {RISCALDAMENTI.map((r) => (
            <Chip key={r.id} label={r.label} active={riscaldamento === r.id} onClick={() => setRiscaldamento(riscaldamento === r.id ? "" : r.id)} />
          ))}
        </div>
      </Field>

      <Field label="Tipo di contratto proposto · obbligatorio per la verifica">
        <div className="chip-row" role="group" aria-label="Tipo di contratto proposto">
          {TIPI_CONTRATTO.map((t) => (
            <Chip key={t.id} label={t.label} active={contratto === t.id} onClick={() => setContratto(contratto === t.id ? "" : t.id)} />
          ))}
        </div>
      </Field>

      <Field label="Disponibile dal · obbligatorio per la verifica">
        <div className="flex gap-2 items-center">
          <input type="date" value={disponibile} onChange={(e) => setDisponibile(e.target.value)} aria-label="Disponibile dal" className="contract-input" style={{ flex: 1 }} />
          <Chip label="Subito" active={disponibile === new Date().toISOString().slice(0, 10)} onClick={() => setDisponibile(new Date().toISOString().slice(0, 10))} />
        </div>
      </Field>

      {mancanti.length > 0 && (
        <p className="field-note" style={{ margin: "-6px 0 0 0" }}>
          Per chiedere la verifica dell&apos;immobile manca ancora: {mancanti.map((d) => d.etichetta.toLowerCase()).join(", ")}. Intanto puoi salvare l&apos;annuncio come bozza.
        </p>
      )}

      <Field label="Classe energetica (APE) · obbligatoria per la verifica">
        <div className="flex flex-wrap gap-2">
          {CLASSI_ENERGETICHE.map((c) => (
            <Chip key={c} label={c} active={classe === c} onClick={() => setClasse(classe === c ? "" : c)} />
          ))}
        </div>
        {!classe && (
          <p className="field-note" style={{ margin: "8px 0 0 0" }}>
            Senza la classe energetica non puoi chiedere la verifica dell&apos;immobile.
          </p>
        )}
        <input
          value={ep}
          onChange={(e) => setEp(e.target.value)}
          inputMode="decimal"
          maxLength={7}
          placeholder="Indice di prestazione, in kWh/m²·anno (facoltativo)"
          aria-label="Indice di prestazione energetica, in kWh al metro quadro all'anno"
          className="contract-input"
          style={{ marginTop: 10 }}
        />
      </Field>

      <Field label="Consiglio sul prezzo">
        <PannelloPrezzo zona={zona} canone={prezzo} mq={mq} classe={classe} quotazioni={quotazioni} />
      </Field>

      <Field label="Foto dell'annuncio">
        <div className={`doc-upload ${foto.length > 0 ? "filled" : ""}`}>
          {foto.length === 0 ? (
            <p className="field-note" style={{ margin: "0 0 12px 0" }}>
              Nessuna foto. Gli annunci con più immagini ricevono molte più
              candidature: caricane almeno tre.
            </p>
          ) : (
            <div className="foto-lista">
              {foto.map((url, i) => (
                <div key={url} className="foto-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Foto ${i + 1}`} />
                  <div className="foto-azioni">
                    <button
                      type="button"
                      onClick={() => spostaFoto(url, -1)}
                      disabled={i === 0}
                      aria-label="Sposta prima"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => spostaFoto(url, 1)}
                      disabled={i === foto.length - 1}
                      aria-label="Sposta dopo"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => rimuoviFoto(url)}
                      aria-label="Rimuovi"
                      className="rimuovi"
                    >
                      ×
                    </button>
                  </div>
                  {i === 0 && <span className="foto-copertina">Copertina</span>}
                </div>
              ))}
            </div>
          )}

          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            disabled={caricamentoFoto}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={caricamentoFoto}
            className="chip"
          >
            {caricamentoFoto
              ? "Caricamento..."
              : foto.length > 0
                ? "Aggiungi altre foto"
                : "Scegli le foto"}
          </button>
          <p className="field-note">
            La prima è la copertina, quella che si vede nel mazzo. Usa le
            frecce per cambiare ordine.
          </p>
          {erroreFoto && <p className="note-error mt-1">{erroreFoto}</p>}
        </div>
      </Field>

      <Field label="Caratteristiche">
        <div className="flex flex-wrap gap-2">
          {ATTR_VOCAB.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              active={!!attributi[a.key]}
              onClick={() => toggleAttributo(a.key)}
            />
          ))}
        </div>
      </Field>

      <Field label="Cosa chiedi ai candidati">
        <CriteriCandidati value={criteri} onChange={setCriteri} />
      </Field>

      <Field label="Visibilità">
        <div className="flex gap-2">
          <Chip label="Pubblicato" active={pubblicato} onClick={() => setPubblicato(true)} />
          <Chip label="Non pubblicato" active={!pubblicato} onClick={() => setPubblicato(false)} />
        </div>
        {immobile?.verifica_stato !== "verificato" && (
          <p className="field-note">
            Gli inquilini vedono un annuncio solo dopo che l&apos;immobile è
            stato verificato, anche se è pubblicato. Per farlo verificare carica
            la prova di proprietà qui sopra, in questa scheda.
          </p>
        )}
      </Field>

      {state?.error && <p className="note-error">{state.error}</p>}
      {state?.ok && <p className="note-saved">Salvato.</p>}
      {erroreDelete && <p className="note-error">{erroreDelete}</p>}

      <button
        type="submit"
        disabled={pending}
        className="opp-cta"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>

      {immobile && (
        <button
          type="button"
          onClick={elimina}
          disabled={pendingDelete}
          className="btn-danger-outline"
        >
          {pendingDelete ? "Eliminazione..." : "Elimina annuncio"}
        </button>
      )}
    </form>
  );
}
