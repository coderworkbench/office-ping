// Office Ping — logomark.
// Inline SVG mirroring /public/logo-mark.svg so pages can set currentColor
// backgrounds via a wrapper (the mark itself keeps its own palette).

type Props = {
  size?: number;
  className?: string;
  /** True = render without the dark rounded tile (just the mark on current bg). */
  flat?: boolean;
};

export function Logo({ size = 32, className = '', flat = false }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size} height={size}
      className={className}
      aria-label="Office Ping"
      role="img"
    >
      {!flat && (
        <>
          <defs>
            <clipPath id="op-rc"><rect width="100" height="100" rx="22" ry="22" /></clipPath>
            <radialGradient id="op-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor="#DC2626" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#DC2626" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#0F1322" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g clipPath="url(#op-rc)">
            <rect width="100" height="100" fill="#0F1322" />
            <rect width="100" height="100" fill="url(#op-glow)" />
            <Mark />
          </g>
        </>
      )}
      {flat && <Mark />}
    </svg>
  );
}

function Mark() {
  return (
    <>
      <path d="M 55.5 23 A 30 30 0 0 1 55.5 77"
            stroke="#F3E8D3" strokeOpacity="0.65" strokeWidth="4"
            fill="none" strokeLinecap="round" />
      <path d="M 51.5 31 A 19 19 0 0 1 51.5 69"
            stroke="#F3E8D3" strokeWidth="5"
            fill="none" strokeLinecap="round" />
      <circle cx="44" cy="50" r="7.5" fill="#DC2626" />
      <circle cx="42" cy="47" r="2.2" fill="#ffffff" fillOpacity="0.45" />
    </>
  );
}
