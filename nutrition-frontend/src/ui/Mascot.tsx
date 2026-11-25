// The small purple header mascot. Moods: default; sunglasses once the protein target is reached;
// "over" (sweat drop, wavy mouth) when the day is clearly over budget; "sleepy" (closed eyes) when
// nothing is logged by noon. A flame for a logging streak (3+ days) shows with any mood.
export type MascotMood = "default" | "sunglasses" | "over" | "sleepy";

const LABELS: Record<MascotMood, string> = {
  default: "Maskottchen",
  sunglasses: "Maskottchen mit Sonnenbrille",
  over: "Maskottchen mit Schweißtropfen",
  sleepy: "Maskottchen, verschlafen",
};

export function Mascot({ mood, flame, size = 36 }: { mood: MascotMood; flame: boolean; size?: number }) {
  const label = `${LABELS[mood]}${flame ? " und Flamme" : ""}`;
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label} data-state={mood} data-flame={flame || undefined}>
      <defs>
        <linearGradient id="mascot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {flame && <path className="mascot-flame" d="M24 1c3 4 6 6 4 10 3-1 4-3 4-5 3 4 2 9-2 11H18c-4-2-4-7-1-10 0 2 1 3 3 4-2-4 1-7 4-10z" fill="#F59E0B" />}
      <path d="M8 30c0-10 7-17 16-17s16 7 16 17c0 7-6 13-16 13S8 37 8 30z" fill="url(#mascot-body)" />
      {mood === "sunglasses" ? (
        <g>
          <rect x="13" y="25" width="9" height="6" rx="2" fill="#0B0914" />
          <rect x="26" y="25" width="9" height="6" rx="2" fill="#0B0914" />
          <path d="M22 27h4" stroke="#0B0914" strokeWidth="2" />
          <path d="M15 26.5l3 0" stroke="#06B6D4" strokeWidth="1" strokeLinecap="round" />
        </g>
      ) : mood === "sleepy" ? (
        <g stroke="#0B0914" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M15.5 28.5c1.5 1.2 3.5 1.2 5 0" />
          <path d="M27.5 28.5c1.5 1.2 3.5 1.2 5 0" />
        </g>
      ) : (
        <g fill="#0B0914">
          <circle cx="18" cy="28" r="2.6" />
          <circle cx="30" cy="28" r="2.6" />
          <circle cx="18.8" cy="27.2" r="0.8" fill="#F5F3FF" />
          <circle cx="30.8" cy="27.2" r="0.8" fill="#F5F3FF" />
        </g>
      )}
      {mood === "over" && <path className="mascot-drop" d="M37 17c1.6 2.4 2.6 3.9 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1.3 1-2.8 2.6-5.2z" fill="#06B6D4" />}
      {mood === "over" ? (
        <path d="M19 36c1.2-1.2 2.4-1.2 3.6 0s2.4 1.2 3.6 0 2.4-1.2 3.6 0" stroke="#0B0914" strokeWidth="2" fill="none" strokeLinecap="round" transform="translate(-1.5 0)" />
      ) : mood === "sleepy" ? (
        <circle cx="24" cy="36" r="1.8" fill="#0B0914" />
      ) : (
        <path d="M20 35c2 2 6 2 8 0" stroke="#0B0914" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
