"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TENANT_TABS = [
  { href: "/", label: "Home" },
  { href: "/candidature", label: "Candidature" },
  { href: "/gestione", label: "Gestione affitto" },
  { href: "/profilo", label: "Profilo" },
];

const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
  { href: "/immobili", label: "Immobili" },
  { href: "/gestione-affitti", label: "Gestione affitti" },
  { href: "/profilo", label: "Profilo" },
];

export function Navigation({
  ruolo,
  nome,
}: {
  ruolo: string;
  nome?: string | null;
}) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;

  return (
    <>
      {/* ---- Desktop: sidebar fissa a sinistra ---- */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 bg-ink px-6 py-8">
        <div className="font-display italic text-xl text-paper mb-10">
          Match<span className="text-gold not-italic">AmI</span>
        </div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? "bg-paper/10 text-gold"
                    : "text-paper/55 hover:text-paper hover:bg-paper/5"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {nome && (
          <div className="mt-auto text-xs text-paper/40">
            Connesso come <span className="text-paper/70">{nome}</span>
          </div>
        )}
      </aside>

      {/* ---- Smartphone: barra fissa in basso ---- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-ink flex items-center justify-around py-3 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
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
    </>
  );
}
