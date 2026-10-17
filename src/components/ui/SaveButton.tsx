export function SaveButton({ pending, disabled = false, etichetta = "Salva" }: { pending: boolean; disabled?: boolean; etichetta?: string }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="opp-cta"
      style={{ marginTop: 6 }}
    >
      {pending ? "Salvataggio..." : etichetta}
    </button>
  );
}
