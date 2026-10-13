export function SaveButton({ pending, disabled = false }: { pending: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="opp-cta"
      style={{ marginTop: 6 }}
    >
      {pending ? "Salvataggio..." : "Salva"}
    </button>
  );
}
