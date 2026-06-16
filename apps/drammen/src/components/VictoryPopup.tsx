import { useEffect, useMemo } from 'react';

// Emoji-regn til feiringen: penger, fotball, champagne, pokal, konfetti.
const EMOJI = ['💵', '💰', '⚽', '🍾', '🏆', '🎉', '🤑', '🥇', '💶', '🎊', '🪙', '🏅'];
const PIECES = 44;
const DEFAULT_DURATION_MS = 9000;

interface Piece {
  emoji: string;
  left: number; // %
  delay: number; // s
  dur: number; // s
  size: number; // px
}

/**
 * Fullskjerm vinner-feiring: gratulasjon til vinneren(e) med fallende emoji-konfetti.
 * Lukker seg selv etter `durationMs`, eller ved trykk. Vises kun når VM er over (styres
 * av kalleren) – pluss en TEST-trigger i admin.
 */
export default function VictoryPopup({
  winners,
  onClose,
  durationMs = DEFAULT_DURATION_MS,
}: {
  winners: string[];
  onClose: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [onClose, durationMs]);

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        emoji: EMOJI[i % EMOJI.length],
        left: Math.random() * 100,
        delay: Math.random() * 3.5,
        dur: 4 + Math.random() * 4,
        size: 18 + Math.random() * 24,
      })),
    [],
  );

  const names = winners.length > 0 ? winners.join(' & ') : 'Vinneren';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Vinner-feiring"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 select-none"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            animation: `wc-confetti-fall ${p.dur}s linear ${p.delay}s infinite`,
          }}
        >
          {p.emoji}
        </span>
      ))}

      <div
        className="relative mx-6 max-w-sm rounded-2xl border-2 border-wc-yellow bg-slate-900/90 px-6 py-8 text-center shadow-2xl"
        style={{ animation: 'wc-victory-pop 0.5s ease-out both' }}
      >
        <div className="text-6xl">🏆</div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-wc-yellow">
          Tippekonk-mester {new Date().getFullYear()}
        </p>
        <p className="mt-1 text-3xl font-extrabold leading-tight text-white">{names}</p>
        <p className="mt-4 text-3xl leading-none">🤑 💰 ⚽ 🍾 💵</p>
        <p className="mt-4 text-sm text-slate-300">Gratulerer så mye! 🎉🎊</p>
        <p className="mt-5 text-[10px] text-slate-500">Trykk for å lukke</p>
      </div>
    </div>
  );
}
