"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { etichettaConteggio } from "@/lib/notifiche";
import {
  IconCasa,
  IconBusta,
  IconChat,
  IconDocumento,
  IconPalazzo,
  IconPersona,
  IconPersone,
} from "@/components/icons";

type Tab = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

const TENANT_TABS: Tab[] = [
  { href: "/", label: "Home", Icon: IconCasa },
  { href: "/candidature", label: "Candidature", Icon: IconChat },
  { href: "/messaggi", label: "Messaggi", Icon: IconBusta },
  { href: "/gestione", label: "Gestione affitto", Icon: IconDocumento },
  { href: "/profilo", label: "Profilo", Icon: IconPersona },
];

const OWNER_TABS: Tab[] = [
  { href: "/", label: "Home", Icon: IconCasa },
  { href: "/database", label: "Database", Icon: IconPersone },
  { href: "/immobili", label: "Immobili", Icon: IconPalazzo },
  { href: "/messaggi", label: "Messaggi", Icon: IconBusta },
  { href: "/gestione-affitti", label: "Gestione affitti", Icon: IconDocumento },
  { href: "/profilo", label: "Profilo", Icon: IconPersona },
];

export function Navigation({
  ruolo,
  nonLette = 0,
  messaggiNonLetti = 0,
}: {
  ruolo: string;
  /** Le novità non ancora lette: se ce ne sono, un numero sulla voce Profilo. */
  nonLette?: number;
  /** I messaggi della chat non ancora letti: se ce ne sono, un numero sulla voce Messaggi. */
  messaggiNonLetti?: number;
  /** Non più mostrato in barra: il nome resta nella schermata Profilo. */
  nome?: string | null;
}) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;
  // Quale numero va su quale voce, e come lo legge chi usa un lettore di schermo.
  const segnalini: Record<string, { etichetta: string; descrizione: string }> = {
    "/profilo": { etichetta: etichettaConteggio(nonLette), descrizione: "novità da leggere" },
    "/messaggi": { etichetta: etichettaConteggio(messaggiNonLetti), descrizione: "messaggi da leggere" },
  };

  return (
    <nav className="tabbar">
      {/* visibile solo nella sidebar desktop */}
      <div className="tabbar-brand">
        Match<b>AmI</b>
      </div>
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`tab-btn ${active ? "active" : ""}`}
          >
            <span className="tab-icona">
              <Icon />
              {segnalini[href]?.etichetta && (
                <span className="tab-badge" role="status" aria-label={`${segnalini[href].etichetta} ${segnalini[href].descrizione}`}>
                  {segnalini[href].etichetta}
                </span>
              )}
            </span>
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
