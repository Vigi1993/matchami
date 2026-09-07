export function Card({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  if (onClick) {
    return (
      <button onClick={onClick} className={`pv-row ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`pv-row ${className}`}>{children}</div>;
}
