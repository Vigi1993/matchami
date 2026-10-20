"use client";

import { useRouter } from "next/navigation";
import { Row } from "@/components/ui/Row";
import { IconInfo } from "@/components/icons";

/** La riga «Come funziona» del Profilo (inquilino e proprietario): apre la spiegazione di match, affidabilità e recensioni. */
export function RigaComeFunziona({ ruolo }: { ruolo: "inquilino" | "proprietario" }) {
  const router = useRouter();
  return (
    <Row
      color="var(--ink-soft)"
      icon={<IconInfo className="fill-none stroke-white stroke-2" />}
      title="Come funziona"
      subtitle={ruolo === "proprietario" ? "Come si calcolano match, affidabilità e recensioni, e come leggere i numeri che vedi." : "Come si calcolano match, affidabilità e recensioni, e cosa vedono i proprietari."}
      cta="Leggi la spiegazione"
      onClick={() => router.push("/come-funziona")}
    />
  );
}
