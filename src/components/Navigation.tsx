"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCasa,
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
  { href: "/gestione", label: "Gestione affitto", Icon: IconDocumento },
  { href: "/profilo", label: "Profilo", Icon: IconPersona },
];

const OWNER_TABS: Tab[] = [
  { href: "/", label: "Home", Icon: IconCasa },
  { href: "/database", label: "Database", Icon: IconPersone },
  { href: "/immobili", label: "Immobili", Icon: IconPalazzo },
  { href: "/gestione-affitti", label: "Gestione affitti", Icon: IconDocumento },
  { href: "/profilo", label: "Profilo", Icon: IconPersona },
];

export function Navigation({
  ruolo,
}: {
  ruolo: string;
  /** Non più mostrato in barra: il nome resta nella schermata Profilo. */
  nome?: string | null;
}) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;

  return (
    <nav className="tabbar">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`tab-btn ${active ? "active" : ""}`}
          >
            <Icon />
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
