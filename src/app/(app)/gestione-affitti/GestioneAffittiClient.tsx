"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import type {
  CandidaturaSenzaContratto,
  ContrattoProprietario,
  StatoContratto,
} from "@/lib/types";
import {
  NESSUN_CONTRATTO_IN_CORSO,
  STATI_CONTRATTO,
  STATO_LABEL,
  badgeStato,
  etichettaStato,
  raggruppaContratti,
} from "@/lib/contratti";
import { creaContratto, aggiornaContratto, type SaveState } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { IconDocumento } from "@/components/icons";

export function GestioneAffittiClient({
  candidatureSenzaContratto,
  contratti,
  rapportiPanel,
}: {
  candidatureSenzaContratto: CandidaturaSenzaContratto[];
  contratti: ContrattoProprietario[];
  /** gli affitti dichiarati e confermati, costruiti dal server */
  rapportiPanel: React.ReactNode;
}) {
  const [nuovaDa, setNuovaDa] = useState<CandidaturaSenzaContratto | null>(
    null
  );
  const [selezionato, setSelezionato] = useState<ContrattoProprietario | null>(
    null
  );

  // I contratti conclusi vanno nello storico: non restano mescolati a quelli in corso.
  const { inCorso, storico } = raggruppaContratti(contratti);

  return (
    <PageContainer wide>
      <h1 className="screen-title">Gestione affitti</h1>
      <p className="screen-sub">
        Contratti dei tuoi immobili, dalla bozza alla firma.
      </p>

      <div className="pref-label" style={{ marginTop: 8 }}>
        <span>Affitti passati e in corso</span>
      </div>
      {rapportiPanel}

      {candidatureSenzaContratto.length > 0 && (
        <>
          <div className="pref-label" style={{ marginTop: 8 }}>
            <span>Da avviare — {candidatureSenzaContratto.length}</span>
          </div>
          <div className="card-grid">
            {candidatureSenzaContratto.map((c) => (
              <button
                key={c.id}
                onClick={() => setNuovaDa(c)}
                className="match-card"
              >
                <div className="mc-avatar">
                  {`${c.nome?.[0] ?? ""}${c.cognome?.[0] ?? ""}`.toUpperCase() ||
                    "IN"}
                </div>
                <div className="mc-body">
                  <div className="mc-zona">{c.listings?.zona}</div>
                  <div className="mc-title">
                    {c.nome} {c.cognome}
                  </div>
                  <div className="mc-meta">{c.listings?.titolo}</div>
                </div>
                <div className="mc-pct is-wait">Crea contratto</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="pref-label" style={{ marginTop: 20 }}>
        <span>I tuoi contratti</span>
      </div>

      {contratti.length === 0 && candidatureSenzaContratto.length === 0 ? (
        <div className="empty-inline" style={{ paddingTop: 30 }}>
          <IconDocumento className="icon-empty" />
          <h3>Nessun contratto ancora</h3>
          <p>
            Appena accetterai una candidatura, potrai avviare il contratto da
            qui.
          </p>
        </div>
      ) : (
        <>
          {inCorso.length > 0 ? (
            <>
              <div className="pref-label" style={{ marginTop: 12 }}>
                <span>In corso — {inCorso.length}</span>
              </div>
              <div className="card-grid">
                {inCorso.map((c) => (
                  <SchedaContratto key={c.id} c={c} onSelect={setSelezionato} />
                ))}
              </div>
            </>
          ) : (
            contratti.length > 0 && (
              <div className="note-box" style={{ marginTop: 12 }}>
                {NESSUN_CONTRATTO_IN_CORSO}
              </div>
            )
          )}

          {storico.length > 0 && (
            <>
              <div className="pref-label" style={{ marginTop: 20 }}>
                <span>Storico — {storico.length}</span>
              </div>
              <div className="card-grid">
                {storico.map((c) => (
                  <SchedaContratto key={c.id} c={c} onSelect={setSelezionato} passato />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ---- Sheet: crea contratto da candidatura accettata ---- */}
      <Sheet
        open={nuovaDa !== null}
        onClose={() => setNuovaDa(null)}
        title={`Nuovo contratto — ${nuovaDa?.nome ?? ""} ${nuovaDa?.cognome ?? ""}`}
      >
        {nuovaDa && (
          <ContrattoForm
            action={creaContratto}
            candidaturaId={nuovaDa.id}
            onSaved={() => setNuovaDa(null)}
          />
        )}
      </Sheet>

      {/* ---- Sheet: modifica contratto esistente ---- */}
      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={`${selezionato?.nome ?? ""} ${selezionato?.cognome ?? ""}`}
      >
        {selezionato && (
          <ContrattoForm
            action={aggiornaContratto}
            contratto={selezionato}
            onSaved={() => setSelezionato(null)}
          />
        )}
      </Sheet>
    </PageContainer>
  );
}

function ContrattoForm({
  action,
  candidaturaId,
  contratto,
  onSaved,
}: {
  action: (prevState: SaveState, formData: FormData) => Promise<SaveState>;
  candidaturaId?: string;
  contratto?: ContrattoProprietario;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const [stato, setStato] = useState<StatoContratto>(
    contratto?.stato ?? "bozza"
  );
  const [canone, setCanone] = useState(contratto?.canone ?? 1200);
  const [durata, setDurata] = useState(contratto?.durata_mesi ?? 24);
  const [dataInizio, setDataInizio] = useState(
    contratto?.data_inizio?.slice(0, 10) ?? ""
  );
  const [dataFirma, setDataFirma] = useState(
    contratto?.data_firma?.slice(0, 10) ?? ""
  );

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onSaved, 600);
      return () => clearTimeout(t);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {candidaturaId && (
        <input type="hidden" name="candidatura_id" value={candidaturaId} />
      )}
      {contratto && <input type="hidden" name="id" value={contratto.id} />}
      <input type="hidden" name="stato" value={stato} />
      <input type="hidden" name="canone" value={canone} />
      <input type="hidden" name="durata_mesi" value={durata} />
      <input type="hidden" name="data_inizio" value={dataInizio} />
      {contratto && (
        <input type="hidden" name="data_firma" value={dataFirma} />
      )}

      <Field label="Stato">
        <div className="flex flex-wrap gap-2">
          {STATI_CONTRATTO.map((s) => (
            <Chip
              key={s}
              label={STATO_LABEL[s]}
              active={stato === s}
              onClick={() => setStato(s)}
            />
          ))}
        </div>
      </Field>

      <Field label={`Canone mensile · €${canone.toLocaleString("it-IT")}`}>
        <input
          type="range"
          min={400}
          max={3500}
          step={50}
          value={canone}
          onChange={(e) => setCanone(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Durata (mesi)">
        <div className="stepper">
          <button
            type="button"
            onClick={() => setDurata((d) => Math.max(6, d - 6))}
          >
            −
          </button>
          <div className="val">{durata}</div>
          <button
            type="button"
            onClick={() => setDurata((d) => Math.min(72, d + 6))}
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Data inizio">
        <input
          type="date"
          value={dataInizio}
          onChange={(e) => setDataInizio(e.target.value)}
          className="contract-input"
        />
      </Field>

      {contratto && (
        <Field label="Data firma">
          <input
            type="date"
            value={dataFirma}
            onChange={(e) => setDataFirma(e.target.value)}
            className="contract-input"
          />
        </Field>
      )}

      {state?.error && <p className="note-error">{state.error}</p>}
      {state?.ok && <p className="note-saved">Salvato.</p>}

      <button
        type="submit"
        disabled={pending}
        className="opp-cta"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>
    </form>
  );
}

/** La scheda di un contratto nell'elenco. Quelle dello storico sono attenuate, come le candidature chiuse. */
function SchedaContratto({
  c,
  onSelect,
  passato = false,
}: {
  c: ContrattoProprietario;
  onSelect: (c: ContrattoProprietario) => void;
  passato?: boolean;
}) {
  return (
    <button onClick={() => onSelect(c)} className="match-card" style={passato ? { opacity: 0.55 } : undefined}>
      <div className="mc-avatar">
        {`${c.nome?.[0] ?? ""}${c.cognome?.[0] ?? ""}`.toUpperCase() || "IN"}
      </div>
      <div className="mc-body">
        <div className="mc-zona">{c.candidature?.listings?.titolo}</div>
        <div className="mc-title">
          {c.nome} {c.cognome}
        </div>
        <div className="mc-meta">{c.canone ? `€${c.canone.toLocaleString("it-IT")}/mese` : "—"}</div>
      </div>
      <div className={`mc-pct ${badgeStato(c.stato)}`}>{etichettaStato(c.stato)}</div>
    </button>
  );
}
