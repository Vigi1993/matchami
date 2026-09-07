/**
 * Riga-scheda cliccabile del Profilo: pastiglia colorata + testo + link.
 * Corrisponde alla `.pv-row` del prototipo.
 */
export function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
  icon,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="pv-row">
      <div
        className="pv-check"
        style={{ background: color, borderColor: color, color: "#fff" }}
      >
        {icon}
      </div>
      <div className="pv-text">
        <div className="pv-label-row">
          <b>{title}</b>
        </div>
        <p>{subtitle}</p>
        <span className="pv-readmore">{cta}</span>
      </div>
    </button>
  );
}
