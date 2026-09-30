#!/usr/bin/env bash
set -e
echo "Applico la Chat realtime (Fase 5)..."

mkdir -p "src/app/(app)/candidature"
mkdir -p "src/app/(app)/database"
mkdir -p "src/app/chat/[id]"
mkdir -p "src/lib"
mkdir -p "supabase/migrations"

cat > "src/lib/types.ts" << 'MATCHAMI_FILE_EOF'
export type Ruolo = "inquilino" | "proprietario";
export type NucleoFamiliare = "single" | "coppia";

export type TenantProfile = {
  profile_id: string;
  professione: string | null;
  reddito_mensile: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  protestato: boolean | null;
  animali: boolean | null;
  nucleo: NucleoFamiliare | null;
  figli: number;
  redditi_nucleo: number;
  presentazione: string | null;
  verificato: boolean;
  verifica_stato: "non_avviata" | "in_verifica" | "verificato";
  budget_max: number | null;
  locali_min: number | null;
  mq_min: number | null;
};

export type StatoContratto = "bozza" | "in_firma" | "firmato" | "concluso";

export type StatoCandidatura = "in_attesa" | "accettata" | "rifiutata";

export type ListingProprietario = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  pubblicato: boolean;
  nCandidature: number;
};

export type OwnerProfile = {
  profile_id: string;
  proprietario_tipo: "privato" | "agenzia" | "property_manager" | null;
  num_immobili: number;
  obiettivo: string | null;
};

export type ImmobileDettaglio = {
  id: string;
  titolo: string;
  descrizione: string | null;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  attributi: Record<string, boolean>;
  pubblicato: boolean;
  fotoUrl: string | null;
  nCandidature: number;
};

export type CandidaturaSenzaContratto = {
  id: string;
  listings: { titolo: string; zona: string } | null;
  nome: string | null;
  cognome: string | null;
};

export type ContrattoProprietario = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
    tenant_id: string;
  } | null;
  nome?: string | null;
  cognome?: string | null;
};

export type Messaggio = {
  id: string;
  mittente_id: string;
  testo: string;
  created_at: string;
};

export type CandidaturaRicevuta = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  created_at: string;
  tenant_id: string;
  listings: { titolo: string; zona: string } | null;
  tenant_profiles: {
    professione: string | null;
    reddito_mensile: number | null;
    verificato: boolean;
    presentazione: string | null;
  } | null;
  // aggiunto lato client dopo il fetch separato di profiles
  nome?: string | null;
  cognome?: string | null;
};

export type CandidaturaConAnnuncio = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  created_at: string;
  listings: {
    titolo: string;
    zona: string;
    prezzo: number;
    locali: number | null;
    mq: number | null;
  } | null;
};

export type ListingConFoto = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  descrizione: string | null;
  listing_photos: { url: string }[];
};

export type ContrattoConAnnuncio = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
  } | null;
};
MATCHAMI_FILE_EOF

cat > "src/app/chat/[id]/page.tsx" << 'MATCHAMI_FILE_EOF'
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./ChatClient";
import type { Messaggio } from "@/lib/types";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: candidatura } = await supabase
    .from("candidature")
    .select("id, tenant_id, status, listings(owner_id, titolo)")
    .eq("id", id)
    .single();

  if (!candidatura) redirect("/");

  const listing = candidatura.listings as unknown as {
    owner_id: string;
    titolo: string;
  } | null;

  const isTenant = candidatura.tenant_id === user!.id;
  const isOwner = listing?.owner_id === user!.id;

  // Se non sei una delle due parti, o la candidatura non è (ancora) un
  // match, non c'è chat da vedere.
  if ((!isTenant && !isOwner) || candidatura.status !== "accettata") {
    redirect("/");
  }

  const altroId = isTenant ? listing!.owner_id : candidatura.tenant_id;
  const { data: altroProfilo } = await supabase
    .from("profiles")
    .select("nome, cognome")
    .eq("id", altroId)
    .single();

  const { data: messaggi } = await supabase
    .from("messaggi")
    .select("id, mittente_id, testo, created_at")
    .eq("candidatura_id", id)
    .order("created_at", { ascending: true });

  const altroNome =
    `${altroProfilo?.nome ?? ""} ${altroProfilo?.cognome ?? ""}`.trim() ||
    "Utente";

  return (
    <ChatClient
      candidaturaId={id}
      userId={user!.id}
      altroNome={altroNome}
      titoloAnnuncio={listing?.titolo ?? ""}
      messaggiIniziali={(messaggi ?? []) as Messaggio[]}
    />
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/chat/[id]/ChatClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Messaggio } from "@/lib/types";

export function ChatClient({
  candidaturaId,
  userId,
  altroNome,
  titoloAnnuncio,
  messaggiIniziali,
}: {
  candidaturaId: string;
  userId: string;
  altroNome: string;
  titoloAnnuncio: string;
  messaggiIniziali: Messaggio[];
}) {
  const router = useRouter();
  const [messaggi, setMessaggi] = useState<Messaggio[]>(messaggiIniziali);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${candidaturaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messaggi",
          filter: `candidatura_id=eq.${candidaturaId}`,
        },
        (payload) => {
          const nuovo = payload.new as Messaggio;
          setMessaggi((prev) =>
            prev.some((m) => m.id === nuovo.id) ? prev : [...prev, nuovo]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidaturaId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  async function invia() {
    const testoTrim = testo.trim();
    if (!testoTrim) return;
    setInvio(true);
    setTesto("");

    const supabase = createClient();
    const { error } = await supabase.from("messaggi").insert({
      candidatura_id: candidaturaId,
      mittente_id: userId,
      testo: testoTrim,
    });

    setInvio(false);
    if (error) {
      setTesto(testoTrim); // rimetti il testo se l'invio fallisce
    }
  }

  return (
    <div className="flex flex-col h-dvh bg-paper">
      <div className="bg-ink text-paper px-4 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          aria-label="Indietro"
          className="text-paper/70 text-xl leading-none px-1"
        >
          ←
        </button>
        <div>
          <div className="font-display font-bold text-sm">{altroNome}</div>
          {titoloAnnuncio && (
            <div className="text-[11px] text-paper/50">{titoloAnnuncio}</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {messaggi.length === 0 && (
          <p className="text-center text-xs text-ink/40 mt-8">
            Nessun messaggio ancora. Scrivi il primo!
          </p>
        )}
        {messaggi.map((m) => {
          const mio = m.mittente_id === userId;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                mio
                  ? "self-end bg-moss text-paper"
                  : "self-start bg-ink/8 text-ink"
              }`}
            >
              {m.testo}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="flex items-center gap-2 p-4 border-t border-ink/10 shrink-0"
      >
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-ink/5 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={invio || !testo.trim()}
          className="bg-gold text-ink font-bold px-5 py-3 rounded-full disabled:opacity-50 text-sm"
        >
          Invia
        </button>
      </form>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/candidature/CandidatureClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio, StatoCandidatura } from "@/lib/types";

const STATO_LABEL: Record<StatoCandidatura, string> = {
  in_attesa: "Da valutare",
  accettata: "Match",
  rifiutata: "Scartata",
};

const STATO_COLOR: Record<StatoCandidatura, string> = {
  in_attesa: "bg-gold/20 text-[#8A6A25]",
  accettata: "bg-moss/15 text-moss",
  rifiutata: "bg-ink/10 text-ink/40",
};

export function CandidatureClient({
  candidature,
}: {
  candidature: CandidaturaConAnnuncio[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaConAnnuncio | null>(
    null
  );

  const inAttesa = candidature.filter((c) => c.status === "in_attesa");
  const accettate = candidature.filter((c) => c.status === "accettata");
  const rifiutate = candidature.filter((c) => c.status === "rifiutata");

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">Le tue candidature</h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Gli annunci a cui ti candidi arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a inviata" : "e inviate"}${
              accettate.length > 0 ? ` · ${accettate.length} match` : ""
            }`}
      </p>

      {candidature.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-4 text-xs text-ink/50">
          Ancora nessuna candidatura. Vai su Home e scorri gli annunci: le
          tue candidature e gli eventuali match finiscono qui.
        </div>
      ) : (
        <>
          {accettate.length > 0 && (
            <Gruppo
              titolo="Match"
              items={accettate}
              onSelect={setSelezionata}
            />
          )}
          {inAttesa.length > 0 && (
            <Gruppo
              titolo="Da valutare"
              items={inAttesa}
              onSelect={setSelezionata}
            />
          )}
          {rifiutate.length > 0 && (
            <Gruppo
              titolo="Scartate"
              items={rifiutate}
              onSelect={setSelezionata}
            />
          )}
        </>
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={selezionata?.listings?.titolo ?? "Candidatura"}
      >
        {selezionata && (
          <div className="flex flex-col gap-4">
            <span
              className={`self-start text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[selezionata.status]}`}
            >
              {STATO_LABEL[selezionata.status]}
            </span>
            <DettaglioRow label="Zona" value={selezionata.listings?.zona ?? "—"} />
            <DettaglioRow
              label="Canone"
              value={
                selezionata.listings?.prezzo
                  ? `€${selezionata.listings.prezzo.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Taglio"
              value={
                selezionata.listings?.locali
                  ? `${selezionata.listings.locali} locali · ${selezionata.listings.mq ?? "—"} m²`
                  : "—"
              }
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow label="Compatibilità" value={`${selezionata.match_pct}%`} />
            )}

            {selezionata.status === "accettata" && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="bg-moss/10 text-moss text-xs rounded-xl p-3">
                  Il proprietario ha accettato la tua candidatura.
                </div>
                <Link
                  href={`/chat/${selezionata.id}`}
                  className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                >
                  Apri chat
                </Link>
              </div>
            )}
            {selezionata.status === "in_attesa" && (
              <div className="bg-ink/5 text-ink/60 text-xs rounded-xl p-3 mt-2">
                Il proprietario non ha ancora valutato questa candidatura.
              </div>
            )}
            {selezionata.status === "rifiutata" && (
              <div className="bg-ink/5 text-ink/50 text-xs rounded-xl p-3 mt-2">
                Il proprietario ha scelto un altro profilo per questo
                annuncio.
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
}: {
  titolo: string;
  items: CandidaturaConAnnuncio[];
  onSelect: (c: CandidaturaConAnnuncio) => void;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-sm text-ink">
                {c.listings?.titolo ?? "Immobile"}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.status]}`}
              >
                {STATO_LABEL[c.status]}
              </span>
            </div>
            <div className="text-xs text-ink/50">
              {c.listings?.zona ?? ""}
              {c.listings?.prezzo && ` · €${c.listings.prezzo.toLocaleString("it-IT")}/mese`}
              {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/10 pb-2">
      <span className="text-ink/50">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/database/DatabaseClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { valutaCandidatura } from "./actions";

export function DatabaseClient({
  candidature,
}: {
  candidature: CandidaturaRicevuta[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaRicevuta | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [aggiornate, setAggiornate] = useState<
    Record<string, "accettata" | "rifiutata">
  >({});

  function stato(c: CandidaturaRicevuta): string {
    return aggiornate[c.id] ?? c.status;
  }

  function valuta(c: CandidaturaRicevuta, nuovo: "accettata" | "rifiutata") {
    startTransition(async () => {
      const res = await valutaCandidatura(c.id, nuovo);
      if (!res?.error) {
        setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
        setSelezionata(null);
      }
    });
  }

  const inAttesa = candidature.filter((c) => stato(c) === "in_attesa");
  const valutate = candidature.filter((c) => stato(c) !== "in_attesa");

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">
        Database inquilini
      </h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Le candidature ricevute sui tuoi annunci arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a ricevuta" : "e ricevute"} · ${inAttesa.length} da valutare`}
      </p>

      {candidature.length === 0 && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessuna candidatura ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena qualcuno si candiderà su un tuo annuncio pubblicato, lo
            vedrai qui.
          </p>
        </div>
      )}

      {inAttesa.length > 0 && (
        <Gruppo
          titolo="Da valutare"
          items={inAttesa}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}
      {valutate.length > 0 && (
        <Gruppo
          titolo="Valutate"
          items={valutate}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={
          selezionata
            ? `${selezionata.nome ?? "Inquilino"} ${selezionata.cognome ?? ""}`
            : "Candidatura"
        }
      >
        {selezionata && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-ink/50">
              Candidatura per{" "}
              <b className="text-ink">{selezionata.listings?.titolo}</b>
            </div>

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
              label="Reddito verificato"
              value={selezionata.tenant_profiles?.verificato ? "Sì" : "No"}
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow
                label="Compatibilità"
                value={`${selezionata.match_pct}%`}
              />
            )}
            {selezionata.tenant_profiles?.presentazione && (
              <div>
                <div className="text-xs text-ink/50 mb-1">Presentazione</div>
                <p className="text-sm text-ink italic">
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            {stato(selezionata) === "in_attesa" ? (
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => valuta(selezionata, "rifiutata")}
                  disabled={pending}
                  className="flex-1 border-2 border-clay text-clay font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Rifiuta
                </button>
                <button
                  onClick={() => valuta(selezionata, "accettata")}
                  disabled={pending}
                  className="flex-1 bg-moss text-paper font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Accetta
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                <div
                  className={`text-xs rounded-xl p-3 ${
                    stato(selezionata) === "accettata"
                      ? "bg-moss/10 text-moss"
                      : "bg-ink/5 text-ink/50"
                  }`}
                >
                  {stato(selezionata) === "accettata"
                    ? "Hai accettato questa candidatura."
                    : "Hai rifiutato questa candidatura."}
                </div>
                {stato(selezionata) === "accettata" && (
                  <Link
                    href={`/chat/${selezionata.id}`}
                    className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                  >
                    Apri chat
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
  stato,
}: {
  titolo: string;
  items: CandidaturaRicevuta[];
  onSelect: (c: CandidaturaRicevuta) => void;
  stato: (c: CandidaturaRicevuta) => string;
}) {
  const COLOR: Record<string, string> = {
    in_attesa: "bg-gold/20 text-[#8A6A25]",
    accettata: "bg-moss/15 text-moss",
    rifiutata: "bg-ink/10 text-ink/40",
  };
  const LABEL: Record<string, string> = {
    in_attesa: "Da valutare",
    accettata: "Accettata",
    rifiutata: "Rifiutata",
  };

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => {
          const s = stato(c);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.nome} {c.cognome}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${COLOR[s]}`}
                >
                  {LABEL[s]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.listings?.titolo} · {c.tenant_profiles?.professione ?? "—"}
                {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/10 pb-2">
      <span className="text-ink/50">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "supabase/migrations/0004_chat_realtime.sql" << 'MATCHAMI_FILE_EOF'
-- ============================================================
-- MatchAmI — Fase 5: chat realtime
-- ============================================================

-- L'inquilino deve poter leggere nome/cognome del proprietario, ma solo
-- dopo che una sua candidatura è stata accettata (prima non ha motivo
-- di conoscere l'identità del proprietario).
create policy "profiles: tenant reads owner after match" on profiles
  for select using (
    exists (
      select 1 from listings l
      join candidature c on c.listing_id = l.id
      where l.owner_id = profiles.id
        and c.tenant_id = auth.uid()
        and c.status = 'accettata'
    )
  );

-- Abilita le notifiche realtime sulla tabella messaggi (necessario perché
-- i messaggi compaiano istantaneamente nella chat, senza dover ricaricare
-- la pagina).
alter publication supabase_realtime add table messaggi;
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
echo ""
echo "IMPORTANTE: esegui anche supabase/migrations/0004_chat_realtime.sql nell'SQL Editor di Supabase."
