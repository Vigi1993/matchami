export function Card({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const base = "bg-white border border-ink/10 rounded-2xl p-4";
  if (onClick) {
    return (
      <button onClick={onClick} className={`w-full text-left ${base} ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}
