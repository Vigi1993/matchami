"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, ZONE_MILANO } from "@/lib/constants";
import type { ImmobileDettaglio } from "@/lib/types";
import type { CriterioRichiesto } from "@/lib/match";
import { CriteriCandidati } from "@/components/CriteriCandidati";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { createClient } from "@/lib/supabase/client";
import { IconPalazzo } from "@/components/icons";
import {
  creaImmobile,
  aggiornaImmobile,
  eliminaImmobile,
  type SaveState,
} from "./actions";

export function ImmobiliClient({
  immobili,
}: {
  immobili: ImmobileDettaglio[];
}) {
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [selezionato, setSelezionato] = useState<ImmobileDettaglio | null>(
    null
  );

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
              onClick={() => setSelezionato(im)}
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
                  €{im.prezzo.toLocaleString("it-IT")}/mese
                  {!im.pubblicato && " · non pubblicato"}
                </div>
              </div>
              <div
                className={`mc-pct ${
                  im.nCandidature > 0 ? "is-match" : "is-off"
                }`}
              >
                {im.nCandidature > 0 ? (
                  <>
                    {im.nCandidature}
                    <span>candidatur{im.nCandidature === 1 ? "a" : "e"}</span>
                  </>
                ) : im.pubblicato ? (
                  "Nessuna candidatura"
                ) : (
                  "Non pubblicato"
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
          onSaved={() => setNuovoAperto(false)}
        />
      </Sheet>

      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={selezionato?.titolo ?? "Immobile"}
      >
        {selezionato && (
          <ImmobileForm
            action={aggiornaImmobile}
            immobile={selezionato}
            onSaved={() => setSelezionato(null)}
          />
        )}
      </Sheet>
    </PageContainer>
  );
}

function ImmobileForm({
  action,
  immobile,
  onSaved,
}: {
  action: (prevState: SaveState, formData: FormData) => Promise<SaveState>;
  immobile?: ImmobileDettaglio;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [erroreDelete, setErroreDelete] = useState<string | null>(null);

  const [zona, setZona] = useState(immobile?.zona ?? ZONE_MILANO[0]);
  const [prezzo, setPrezzo] = useState(immobile?.prezzo ?? 1200);
  const [locali, setLocali] = useState(immobile?.locali ?? 2);
  const [mq, setMq] = useState(immobile?.mq ?? 50);
  const [attributi, setAttributi] = useState<Record<string, boolean>>(
    immobile?.attributi ?? {}
  );
  const [pubblicato, setPubblicato] = useState(immobile?.pubblicato ?? true);
  const [foto, setFoto] = useState<string[]>(immobile?.foto ?? []);
  const [criteri, setCriteri] = useState<CriterioRichiesto[]>(immobile?.criteri ?? []);
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
      <input type="hidden" name="zona" value={zona} />
      <input type="hidden" name="prezzo" value={prezzo} />
      <input type="hidden" name="locali" value={locali} />
      <input type="hidden" name="mq" value={mq} />
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

      <Field label="Zona">
        <div className="flex flex-wrap gap-2">
          {ZONE_MILANO.map((z) => (
            <Chip
              key={z}
              label={z.split(",")[0]}
              active={zona === z}
              onClick={() => setZona(z)}
            />
          ))}
        </div>
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
