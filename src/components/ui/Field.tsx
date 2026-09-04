export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-ink/70 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
