import { useRef, useState, type ReactNode } from "react";

const THRESHOLD = 96;

/**
 * Swipe left to delete, no confirmation dialog (the caller offers an undo toast instead). The
 * visible ✕ button does the same for mouse, keyboard and screen readers.
 */
export function SwipeRow({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef(false);

  return (
    <li className="swipe" data-testid="entry-row">
      <div className="swipe-bg" aria-hidden="true">
        Entfernen
      </div>
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : "transform 180ms ease" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          horizontal.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!horizontal.current) {
            if (Math.abs(mx) < 8) return;
            if (Math.abs(my) > Math.abs(mx)) {
              start.current = null; // a vertical scroll, not a swipe
              return;
            }
            horizontal.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          setDx(Math.min(0, mx));
        }}
        onPointerUp={() => {
          const swiped = dx <= -THRESHOLD;
          start.current = null;
          setDx(swiped ? -480 : 0);
          if (swiped) setTimeout(onDelete, 150);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        {children}
        <button type="button" className="icon" aria-label={`${label} entfernen`} onClick={onDelete}>
          ✕
        </button>
      </div>
    </li>
  );
}
