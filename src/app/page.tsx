import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, cognome, ruolo")
    .eq("id", user!.id)
    .single();

  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display italic text-2xl">
        Match<span className="text-gold not-italic">AmI</span>
      </h1>
      <p className="text-sm text-ink/70">
        Ciao {profile?.nome ?? user!.email}! Sei registrato come{" "}
        <b>{profile?.ruolo}</b>.
      </p>
      <p className="text-xs text-ink/50 max-w-xs">
        Questa è una pagina segnaposto: l&apos;autenticazione vera funziona,
        le schermate Home/Profilo/Candidature reali arrivano nella Fase 4.
      </p>
      <form action={logout}>
        <button className="text-xs px-4 py-2 rounded-full border border-ink/20 mt-2">
          Esci
        </button>
      </form>
    </main>
  );
}
