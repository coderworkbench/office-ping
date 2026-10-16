// Office Ping — logomark.
// Inline SVG mirroring /public/logo-mark.svg. Sunbeam rail brand (§18.1):
// a --gold-fill tile with the mark in --on-gold.

type Props = {
  size?: number;
  className?: string;
  /** True = render without the gold rounded tile (just the mark on current bg). */
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
          </defs>
          <g clipPath="url(#op-rc)">
            <rect width="100" height="100" fill="#F6C62C" />
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
            stroke="#3A2F05" strokeOpacity="0.55" strokeWidth="4"
            fill="none" strokeLinecap="round" />
      <path d="M 51.5 31 A 19 19 0 0 1 51.5 69"
            stroke="#3A2F05" strokeWidth="5"
            fill="none" strokeLinecap="round" />
      <circle cx="44" cy="50" r="7.5" fill="#3A2F05" />
      <circle cx="42" cy="47" r="2.2" fill="#F6C62C" fillOpacity="0.6" />
    </>
  );
}
