import { useEffect, useMemo } from 'react';

// Offisielle VM-farger til konfettien (samme palett som stripene).
const WC_COLORS = ['#e21602', '#e84b09', '#e8fc4a', '#afe905', '#66fbda', '#324dfb', '#6001e6', '#b188fc'];
// Litt emoji ispedd den fargede konfettien: penger, fotball, champagne, pokal.
const EMOJI = ['💵', '💰', '⚽', '🍾', '🏆', '🤑', '🥇', '🎉'];
const RECTS = 64;
const EMOJIS = 16;

type Piece =
  | { type: 'rect'; color: string; w: number; h: number; left: number; delay: number; dur: number }
  | { type: 'emoji'; char: string; size: number; left: number; delay: number; dur: number };

/**
 * Fullskjerm vinner-feiring: gratulasjon til vinneren(e) over en levende, stripet VM-bakgrunn,
 * med fargerik konfetti (VM-fargene) + litt emoji som regner ned. Lukkes KUN manuelt (knapp eller
 * Escape) – ingen auto-timeout. Vises kun når VM er over (styres av kalleren) + en TEST-trigger i admin.
 */
export default function VictoryPopup({ winners, onClose }: { winners: string[]; onClose: () => void }) {
  // Escape lukker (fysisk handling, som knappen) – ingen auto-lukk.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pieces = useMemo<Piece[]>(() => {
    const arr: Piece[] = [];
    // Negativ delay → hver bit starter midt i sin egen syklus, så regnet er fullt og jevnt fra
    // første frame (ingen stabling på toppen mens man venter), og løkker sømløst.
    for (let i = 0; i < RECTS; i++) {
      const dur = 3.5 + Math.random() * 3.5;
      arr.push({
        type: 'rect',
        color: WC_COLORS[i % WC_COLORS.length],
        w: 6 + Math.random() * 5,
        h: 10 + Math.random() * 8,
        left: Math.random() * 100,
        dur,
        delay: -Math.random() * dur,
      });
    }
    for (let i = 0; i < EMOJIS; i++) {
      const dur = 4 + Math.random() * 4;
      arr.push({
        type: 'emoji',
        char: EMOJI[i % EMOJI.length],
        size: 20 + Math.random() * 16,
        left: Math.random() * 100,
        dur,
        delay: -Math.random() * dur,
      });
    }
    return arr;
  }, []);

  const names = winners.length > 0 ? winners.join(' & ') : 'Vinneren';

  return (
    <div
      className="wc-stripes-bright fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Vinner-feiring"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 select-none"
          style={{
            left: `${p.left}%`,
            animation: `wc-confetti-fall ${p.dur}s linear ${p.delay}s infinite`,
            ...(p.type === 'rect'
              ? { width: `${p.w}px`, height: `${p.h}px`, backgroundColor: p.color, borderRadius: '1px' }
              : { fontSize: `${p.size}px` }),
          }}
        >
          {p.type === 'emoji' ? p.char : null}
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
        <p className="mt-3 text-sm text-slate-300">Gratulerer så mye! 🎉🎊</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-[44px] w-full rounded-lg bg-wc-red px-4 font-semibold text-white active:opacity-80"
        >
          Lukk
        </button>
      </div>
    </div>
  );
}
