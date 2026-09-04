"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TENANT_TABS = [
  { href: "/", label: "Home" },
  { href: "/candidature", label: "Candidature" },
  { href: "/gestione", label: "Gestione affitto" },
  { href: "/profilo", label: "Profilo" },
];

// Le schermate proprietario arrivano in un prossimo passo: per ora,
// se il ruolo è proprietario, mostriamo solo Home per non linkare
// a pagine che non esistono ancora.
const OWNER_TABS = [{ href: "/", label: "Home" }];

export function TabBar({ ruolo }: { ruolo: string }) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-ink flex items-center justify-around py-3 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center text-center text-[10px] font-semibold px-2 leading-tight ${
              active ? "text-gold" : "text-paper/50"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
