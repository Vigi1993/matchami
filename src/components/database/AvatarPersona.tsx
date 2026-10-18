import type { DatiScheda } from "@/lib/database-proprietario";

/**
 * La foto di una persona, o la sua iniziale se non ne ha una. Solo disegno: la misura la decide lo stile (`db-avatar`, `db-avatar-grande`).
 */
export function AvatarPersona({ scheda, grande = false }: { scheda: Pick<DatiScheda, "nome" | "avatarUrl">; grande?: boolean }) {
  const classe = `db-avatar ${grande ? "db-avatar-grande" : ""}`;
  if (scheda.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={scheda.avatarUrl} alt="" className={classe} />;
  }
  return (
    <span className={`${classe} db-avatar-iniziale`} aria-hidden="true">
      {scheda.nome.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
