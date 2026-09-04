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

  return (
    <div className="min-h-screen bg-paper">
      <Navigation ruolo={ruolo} nome={profile?.nome} />
      {/* pb-24: spazio per la barra in basso su smartphone.
          md:pl-64: spazio per la sidebar su desktop. md:pb-0: sul
          desktop la barra in basso non c'è, non serve il margine. */}
      <div className="pb-24 md:pb-0 md:pl-64">{children}</div>
    </div>
  );
}
