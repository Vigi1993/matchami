import { createClient } from "@/lib/supabase/server";
import { TabBar } from "@/components/TabBar";

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
    .select("ruolo")
    .eq("id", user!.id)
    .single();

  const ruolo = profile?.ruolo ?? "inquilino";

  return (
    <div className="min-h-screen bg-paper">
      <div className="pb-24">{children}</div>
      <TabBar ruolo={ruolo} />
    </div>
  );
}
