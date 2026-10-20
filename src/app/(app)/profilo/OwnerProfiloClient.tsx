"use client";

import { useState } from "react";
import { logout } from "@/app/login/actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Row } from "@/components/ui/Row";
import { CampanellaNovita } from "@/components/CampanellaNovita";
import { PrivacySheet } from "@/components/PrivacySheet";
import { FaqSheet } from "@/components/FaqSheet";
import { RigaComeFunziona } from "@/components/RigaComeFunziona";
import { AccountSheet } from "@/components/AccountSheet";
import { iniziali, nomeCompleto } from "@/lib/persona";
import { IconDomanda, IconLucchetto, IconScudo } from "@/components/icons";

/**
 * Il profilo del proprietario: in alto il nome (con l'email sotto) e la campanella delle novità nell'angolo, come per l'inquilino;
 * sotto solo ciò che serve davvero: l'account, la privacy, le domande frequenti. Non ci sono «dati» del proprietario da compilare:
 * nome e email stanno nell'account, e ciò che conta per lui (la verifica) sta negli immobili.
 */
export function OwnerProfiloClient({
  nonLette,
  nome,
  cognome,
  email,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: {
  /** le novità non ancora lette */
  nonLette: number;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
}) {
  const [accountAperto, setAccountAperto] = useState(false);
  const [privacyAperto, setPrivacyAperto] = useState(false);
  const [faqAperto, setFaqAperto] = useState(false);

  return (
    <PageContainer>
      {/* In alto: l'avatar, il nome e la campanella delle novità nell'angolo */}
      <div className="avatar-row">
        <div className="avatar">{iniziali(nome, cognome)}</div>
        <div className="avatar-testo">
          <h1 className="avatar-name">{nomeCompleto(nome, cognome) || "Il tuo profilo"}</h1>
          {email && <div className="avatar-sub">{email}</div>}
        </div>
        <CampanellaNovita nonLette={nonLette} />
      </div>

      <div className="card-grid">
        <Row
          color="var(--ink-soft)"
          icon={<IconLucchetto className="fill-none stroke-white stroke-2" />}
          title="Account e accesso"
          subtitle="Nome, email di accesso e password del tuo account MatchAmI."
          cta="Gestisci l'account"
          onClick={() => setAccountAperto(true)}
        />
        <Row
          color="var(--moss)"
          icon={<IconScudo className="fill-white stroke-none" />}
          title="Privacy e consensi"
          subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
          cta="Gestisci consensi"
          onClick={() => setPrivacyAperto(true)}
        />
        <RigaComeFunziona ruolo="proprietario" />
        <Row
          color="var(--gold)"
          icon={<IconDomanda className="fill-none stroke-[var(--ink)] stroke-2" />}
          title="FAQ"
          subtitle="Domande frequenti su MatchAmI per i proprietari."
          cta="Vedi le domande frequenti"
          onClick={() => setFaqAperto(true)}
        />
      </div>

      <form action={logout} className="mt-6">
        <button className="redo-link" style={{ color: "var(--muted)" }}>
          Esci
        </button>
      </form>

      <AccountSheet open={accountAperto} onClose={() => setAccountAperto(false)} nome={nome} cognome={cognome} email={email} ruolo="proprietario" />

      <PrivacySheet
        open={privacyAperto}
        onClose={() => setPrivacyAperto(false)}
        consensoMarketingIniziale={consensoMarketingIniziale}
        consensoTerziIniziale={consensoTerziIniziale}
      />
      <FaqSheet open={faqAperto} onClose={() => setFaqAperto(false)} ruolo="proprietario" />
    </PageContainer>
  );
}
