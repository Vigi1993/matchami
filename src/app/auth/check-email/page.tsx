export default function CheckEmailPage() {
  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display italic text-2xl">
        Match<span className="text-gold not-italic">AmI</span>
      </h1>
      <p className="text-paper/80 text-sm max-w-sm">
        Ti abbiamo mandato un&apos;email di conferma. Apri il link che trovi
        dentro per attivare il tuo account e iniziare.
      </p>
    </main>
  );
}
