export function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 text-left mb-4"
    >
      <div className="w-9 h-9 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1">
        <div className="font-display font-bold text-sm text-ink">{title}</div>
        <p className="text-xs text-ink/55 leading-snug">{subtitle}</p>
        <span className="text-xs text-moss font-semibold">{cta}</span>
      </div>
    </button>
  );
}
