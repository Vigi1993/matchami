"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import type {
  CandidaturaSenzaContratto,
  ContrattoProprietario,
  StatoContratto,
} from "@/lib/types";
import { creaContratto, aggiornaContratto, type SaveState } from "./actions";

const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

const STATO_COLOR: Record<StatoContratto, string> = {
  bozza: "bg-ink/10 text-ink/60",
  in_firma: "bg-gold/20 text-[#8A6A25]",
  firmato: "bg-moss/15 text-moss",
  concluso: "bg-ink/10 text-ink/60",
};

const STATI: StatoContratto[] = ["bozza", "in_firma", "firmato", "concluso"];

export function GestioneAffittiClient({
  candidatureSenzaContratto,
  contratti,
}: {
  candidatureSenzaContratto: CandidaturaSenzaContratto[];
  contratti: ContrattoProprietario[];
}) {
  const [nuovaDa, setNuovaDa] = useState<CandidaturaSenzaContratto | null>(
    null
  );
  const [selezionato, setSelezionato] = useState<ContrattoProprietario | null>(
    null
  );

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">Gestione affitti</h1>
      <p className="text-xs text-ink/50 mb-6">
        Contratti dei tuoi immobili, dalla bozza alla firma.
      </p>

      {candidatureSenzaContratto.length > 0 && (
        <>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
            Da avviare · {candidatureSenzaContratto.length}
          </div>
          <div className="flex flex-col gap-3 mb-6">
            {candidatureSenzaContratto.map((c) => (
              <button
                key={c.id}
                onClick={() => setNuovaDa(c)}
                className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-bold text-sm text-ink">
                    {c.nome} {c.cognome}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gold/20 text-[#8A6A25]">
                    Crea contratto
                  </span>
                </div>
                <div className="text-xs text-ink/50">
                  {c.listings?.titolo} · {c.listings?.zona}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi contratti {contratti.length > 0 && `· ${contratti.length}`}
      </div>

      {contratti.length === 0 && candidatureSenzaContratto.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessun contratto ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena accetterai una candidatura, potrai avviare il contratto
            da qui.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {contratti.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelezionato(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.nome} {c.cognome}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.stato]}`}
                >
                  {STATO_LABEL[c.stato]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.candidature?.listings?.titolo}
                {c.canone && ` · €${c.canone.toLocaleString("it-IT")}/mese`}
              </div>
            </button>
          ))}
        </div>
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
    </div>
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
          {STATI.map((s) => (
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
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setDurata((d) => Math.max(6, d - 6))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
          >
            −
          </button>
          <div className="text-sm font-bold text-ink w-16 text-center">
            {durata}
          </div>
          <button
            type="button"
            onClick={() => setDurata((d) => Math.min(72, d + 6))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
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
          className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
      </Field>

      {contratto && (
        <Field label="Data firma">
          <input
            type="date"
            value={dataFirma}
            onChange={(e) => setDataFirma(e.target.value)}
            className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
          />
        </Field>
      )}

      {state?.error && <p className="text-clay text-xs">{state.error}</p>}
      {state?.ok && <p className="text-moss text-xs">Salvato.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl disabled:opacity-60"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-ink/70 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-2 rounded-full border transition-colors ${
        active
          ? "bg-moss/15 border-moss text-moss"
          : "bg-ink/5 border-transparent text-ink/60"
      }`}
    >
      {label}
    </button>
  );
}
