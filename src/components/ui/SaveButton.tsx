export function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="opp-cta"
      style={{ marginTop: 6 }}
    >
      {pending ? "Salvataggio..." : "Salva"}
    </button>
  );
}
