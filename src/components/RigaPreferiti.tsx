"use client";

import { useRouter } from "next/navigation";
import { Row } from "@/components/ui/Row";
import { IconSegnalibro } from "@/components/icons";
import { sottotitoloPreferiti } from "@/lib/scelte";

/** La riga «Preferiti» del Profilo dell'inquilino: apre l'elenco degli annunci salvati. */
export function RigaPreferiti({ preferiti }: { preferiti: number }) {
  const router = useRouter();
  return (
    <Row
      color={preferiti > 0 ? "var(--moss)" : "var(--ink-soft)"}
      icon={<IconSegnalibro className="fill-none stroke-white stroke-2" />}
      title="Preferiti"
      subtitle={sottotitoloPreferiti(preferiti)}
      cta="Vedi i preferiti"
      onClick={() => router.push("/preferiti")}
    />
  );
}
