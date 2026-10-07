"use client";

import { useRouter } from "next/navigation";
import { Row } from "@/components/ui/Row";
import { IconCampana } from "@/components/icons";
import { sottotitoloNovita } from "@/lib/notifiche";

/**
 * La riga «Novità» in cima al Profilo, per inquilini e proprietari: apre
 * la pagina con l'elenco delle notifiche.
 */
export function RigaNovita({ nonLette }: { nonLette: number }) {
  const router = useRouter();
  return (
    <Row
      color={nonLette > 0 ? "var(--clay)" : "var(--ink-soft)"}
      icon={<IconCampana className="fill-none stroke-white stroke-2" />}
      title="Novità"
      subtitle={sottotitoloNovita(nonLette)}
      cta="Vedi le novità"
      onClick={() => router.push("/notifiche")}
    />
  );
}
