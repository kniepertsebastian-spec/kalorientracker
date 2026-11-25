// The small purple header mascot. States: default; sunglasses once the protein target is reached;
// a flame when there is a logging streak (3+ days). Both can show at once.
export function Mascot({ sunglasses, flame, size = 36 }: { sunglasses: boolean; flame: boolean; size?: number }) {
  const label = sunglasses && flame ? "Maskottchen mit Sonnenbrille und Flamme" : sunglasses ? "Maskottchen mit Sonnenbrille" : flame ? "Maskottchen mit Flamme" : "Maskottchen";
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label} data-state={sunglasses ? "sunglasses" : flame ? "flame" : "default"}>
      <defs>
        <linearGradient id="mascot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {flame && <path className="mascot-flame" d="M24 1c3 4 6 6 4 10 3-1 4-3 4-5 3 4 2 9-2 11H18c-4-2-4-7-1-10 0 2 1 3 3 4-2-4 1-7 4-10z" fill="#F59E0B" />}
      <path d="M8 30c0-10 7-17 16-17s16 7 16 17c0 7-6 13-16 13S8 37 8 30z" fill="url(#mascot-body)" />
      {sunglasses ? (
        <g>
          <rect x="13" y="25" width="9" height="6" rx="2" fill="#0B0914" />
          <rect x="26" y="25" width="9" height="6" rx="2" fill="#0B0914" />
          <path d="M22 27h4" stroke="#0B0914" strokeWidth="2" />
          <path d="M15 26.5l3 0" stroke="#06B6D4" strokeWidth="1" strokeLinecap="round" />
        </g>
      ) : (
        <g fill="#0B0914">
          <circle cx="18" cy="28" r="2.6" />
          <circle cx="30" cy="28" r="2.6" />
          <circle cx="18.8" cy="27.2" r="0.8" fill="#F5F3FF" />
          <circle cx="30.8" cy="27.2" r="0.8" fill="#F5F3FF" />
        </g>
      )}
      <path d="M20 35c2 2 6 2 8 0" stroke="#0B0914" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
