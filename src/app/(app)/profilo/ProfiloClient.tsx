"use client";

import { useState } from "react";
import { CampanellaNovita } from "@/components/CampanellaNovita";
import { iniziali, nomeCompleto } from "@/lib/persona";
import { DatiSheet } from "@/components/DatiSheet";
import { RigaPreferiti } from "@/components/RigaPreferiti";
import {
  computeAffidabilita,
  computeProfileCompleteness,
} from "@/lib/affidabilita";
import type { TenantProfile } from "@/lib/types";
import { logout } from "@/app/login/actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { RicercaSheet } from "@/components/RicercaSheet";
import { testoRecensioni, type RiepilogoRecensioni, type StatoRaccomandazione } from "@/lib/recensioni";
import type { SezioneProfilo } from "@/lib/home";
import type { Luogo } from "@/lib/luoghi";
import type { ProfiloRicerca } from "@/lib/match";
import { PrivacySheet } from "@/components/PrivacySheet";
import { FaqSheet } from "@/components/FaqSheet";
import { AccountSheet } from "@/components/AccountSheet";
import {
  IconDomanda,
  IconLente,
  IconLucchetto,
  IconScudo,
  IconStella,
} from "@/components/icons";

type Props = {
  /** le novità non ancora lette */
  nonLette: number;
  /** quanti annunci ha salvato tra i preferiti */
  preferiti?: number;
  /** il pannello per verificare il reddito con i documenti, costruito dal server */
  verificaPanel: React.ReactNode;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  tenant: TenantProfile;
  /** la ricerca com'è salvata */
  ricerca: ProfiloRicerca;
  /** i luoghi che si possono cercare */
  luoghi: Luogo[];
  /** le recensioni dei proprietari: la media e quante sono (a parte dal punteggio) */
  recensioni: RiepilogoRecensioni;
  /** il badge «Inquilino raccomandato» */
  raccomandazione: StatoRaccomandazione;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
  /** la scheda da aprire subito (da un collegamento con ?apri=...), se è tra quelle ammesse */
  aperturaIniziale?: SezioneProfilo | null;
};

export function ProfiloClient({
  nonLette,
  preferiti = 0,
  nome,
  cognome,
  email,
  tenant,
  verificaPanel,
  ricerca,
  luoghi,
  recensioni,
  raccomandazione,
  consensoMarketingIniziale,
  consensoTerziIniziale,
  aperturaIniziale = null,
}: Props) {
  const [sheetAperta, setSheetAperta] = useState<
    | "affidabilita"
    | "dati"
    | "ricerca"
    | "verifica"
    | "account"
    | "privacy"
    | "faq"
    | null
  >(aperturaIniziale);

  const affidabilita = computeAffidabilita({
    verificato: tenant.verificato,
    protestato: tenant.protestato,
    garante: tenant.garante,
    fideiussione: tenant.fideiussione,
  });

  const completezza = computeProfileCompleteness({
    hasZone: (ricerca.luoghi?.length ?? 0) > 0 || ricerca.zone.length > 0,
    professione: tenant.professione,
    reddito_mensile: tenant.reddito_mensile,
    reddito_nucleo: tenant.reddito_nucleo,
    garante: tenant.garante,
    animali: tenant.animali,
    presentazione: tenant.presentazione,
    nucleo: tenant.nucleo,
    fideiussione: tenant.fideiussione,
  });

  return (
    <PageContainer>
      {/* In alto: l'avatar, il nome e la campanella delle novità nell'angolo */}
      <div className="avatar-row">
        <div className="avatar">
          {tenant.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.avatar_url} alt="" />
          ) : (
            iniziali(nome, cognome)
          )}
        </div>
        <div className="avatar-testo">
          <h1 className="avatar-name">{nomeCompleto(nome, cognome) || "Il tuo profilo"}</h1>
          {email && <div className="avatar-sub">{email}</div>}
          {/* quanto è completo il profilo: sotto il nome, dove si legge insieme a chi sei */}
          <div
            className="completezza"
            role="progressbar"
            aria-label="Completezza del profilo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completezza}
            aria-valuetext={`Profilo completo al ${completezza}%`}
          >
            <span className="completezza-testo">Profilo completo al {completezza}%</span>
            <div className="completeness-bar">
              <div className="completeness-fill" style={{ width: `${completezza}%` }} />
            </div>
          </div>
        </div>
        <CampanellaNovita nonLette={nonLette} />
      </div>

      {/* I tuoi dati e la tua affidabilità: un'unica scheda (punteggio, dati, verifica del reddito) */}
      <Row
        color="var(--gold)"
        icon={<IconStella className="fill-white stroke-none" />}
        title={`${affidabilita.punteggio}/100 · Affidabilità ${affidabilita.label}`}
        subtitle={`Il tuo punteggio, i tuoi dati e la verifica del reddito. Recensioni, a parte: ${testoRecensioni(recensioni)}.${raccomandazione.raccomandato ? " Sei un inquilino raccomandato." : ""}`}
        cta="Vedi e modifica i tuoi dati"
        onClick={() => setSheetAperta("dati")}
      />

      <div className="card-grid">
        <RigaPreferiti preferiti={preferiti} />
        {/* La tua ricerca */}
        <Row
          color="var(--clay)"
          icon={<IconLente className="fill-none stroke-white stroke-2" />}
          title="La tua ricerca"
          subtitle="Budget, zone, taglio e caratteristiche della casa che stai cercando."
          cta="Vedi il dettaglio"
          onClick={() => setSheetAperta("ricerca")}
        />

      {/* Account */}
        <Row
          color="var(--ink-soft)"
          icon={<IconLucchetto className="fill-none stroke-white stroke-2" />}
          title="Account e accesso"
          subtitle="Nome, email di accesso e password del tuo account MatchAmI."
          cta="Gestisci l'account"
          onClick={() => setSheetAperta("account")}
        />

        {/* Privacy / FAQ */}
        <Row
          color="var(--moss)"
          icon={<IconScudo className="fill-white stroke-none" />}
          title="Privacy e consensi"
          subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
          cta="Gestisci consensi"
          onClick={() => setSheetAperta("privacy")}
        />
        <Row
          color="var(--gold)"
          icon={<IconDomanda className="fill-none stroke-[var(--ink)] stroke-2" />}
          title="FAQ e bonus affitto"
          subtitle="Bonus giovani, contributo Comune di Milano, detrazioni 730 e altre curiosità."
          cta="Vedi le domande frequenti"
          onClick={() => setSheetAperta("faq")}
        />
      </div>

      <form action={logout} className="mt-6">
        <button className="redo-link" style={{ color: "var(--muted)" }}>
          Esci
        </button>
      </form>

      {/* ---- Sheet: I tuoi dati (punteggio, dati da modificare, verifica del reddito) ----
          Le vecchie sezioni «dati», «affidabilita» e «verifica» (collegamenti, notifiche) aprono tutte questa. */}
      <DatiSheet
        open={sheetAperta === "dati" || sheetAperta === "affidabilita" || sheetAperta === "verifica"}
        onClose={() => setSheetAperta(null)}
        tenant={tenant}
        affidabilita={affidabilita}
        recensioni={recensioni}
        raccomandazione={raccomandazione}
        verificaPanel={verificaPanel}
        scorriA={sheetAperta === "verifica" ? "verifica" : null}
      />

      {/* ---- Sheet: La tua ricerca ---- */}
      <RicercaSheet
        open={sheetAperta === "ricerca"}
        onClose={() => setSheetAperta(null)}
        ricerca={ricerca}
        luoghi={luoghi}
      />

      {/* ---- Sheet: Account ---- */}
      <AccountSheet
        open={sheetAperta === "account"}
        onClose={() => setSheetAperta(null)}
        nome={nome}
        cognome={cognome}
        email={email}
        ruolo="inquilino"
      />

      {/* ---- Sheet: Privacy e FAQ ---- */}
      <PrivacySheet
        open={sheetAperta === "privacy"}
        onClose={() => setSheetAperta(null)}
        consensoMarketingIniziale={consensoMarketingIniziale}
        consensoTerziIniziale={consensoTerziIniziale}
        visibileProprietariIniziale={tenant.visibile_ai_proprietari === true}
      />
      <FaqSheet open={sheetAperta === "faq"} onClose={() => setSheetAperta(null)} />
        </PageContainer>
  );
}

function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
  icon,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="pv-row">
      <div
        className="pv-check"
        style={{ background: color, borderColor: color }}
      >
        {icon}
      </div>
      <div className="pv-text">
        <div className="pv-label-row">
          <b>{title}</b>
        </div>
        <p>{subtitle}</p>
        <span className="pv-readmore">{cta}</span>
      </div>
    </button>
  );
}
