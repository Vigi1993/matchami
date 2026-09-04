import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, ruolo")
    .eq("id", user!.id)
    .single();

  return (
    <div className="px-6 pt-16 pb-8 text-center flex flex-col items-center gap-3">
      <h1 className="font-display italic text-2xl text-ink">
        Match<span className="text-gold not-italic">AmI</span>
      </h1>
      <p className="text-sm text-ink/70">
        Ciao {profile?.nome ?? user!.email}! Sei registrato come{" "}
        <b>{profile?.ruolo}</b>.
      </p>
      <p className="text-xs text-ink/50 max-w-xs">
        Home ancora segnaposto: lo swipe delle case e il voto di
        affidabilità arrivano in un prossimo passo. Nel frattempo il
        Profilo, qui sotto, è già collegato al database vero.
      </p>
    </div>
  );
}
