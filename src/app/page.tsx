import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  let supabaseStatus: "ok" | "non configurato" | "errore" = "non configurato";

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      // Una query innocua solo per verificare che le credenziali/rete funzionino.
      const { error } = await supabase.from("profiles").select("id").limit(1);
      supabaseStatus = error ? "errore" : "ok";
    } catch {
      supabaseStatus = "errore";
    }
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display italic text-3xl">
        Match<span className="text-gold not-italic">AmI</span>
      </h1>
      <p className="text-paper/70 max-w-sm text-sm">
        Scheletro del progetto pronto: Next.js, Tailwind con la palette del
        prototipo, e client Supabase collegato.
      </p>
      <div className="text-xs px-4 py-2 rounded-full border border-paper/20">
        Stato connessione Supabase: <b>{supabaseStatus}</b>
      </div>
    </main>
  );
}
