import { createClient } from "@/lib/supabase/server";
import { Navigation } from "@/components/Navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("ruolo, nome")
    .eq("id", user!.id)
    .single();

  const ruolo = profile?.ruolo ?? "inquilino";

  /*
    Come nel prototipo: un unico "telaio" da 480px centrato, alto quanto
    la viewport e senza scroll di pagina. Dentro, l'area delle schermate
    (che scorre da sola) e la tab bar fissa in basso.
  */
  return (
    <div className="app-shell">
      <div className="screens">{children}</div>
      <Navigation ruolo={ruolo} nome={profile?.nome} />
    </div>
  );
}
