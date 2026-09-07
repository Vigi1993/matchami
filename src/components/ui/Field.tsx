export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pref-section">
      <div className="pref-label">{label}</div>
      {children}
    </div>
  );
}
