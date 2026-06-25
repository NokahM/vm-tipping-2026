import { APP_CONFIG } from '../config';
import type { BonusStore, KnockoutStore } from './storage';

/**
 * Klient mot /api/state (vår serverless-funksjon med Upstash Redis/«Vercel KV» bak).
 * Dette er den DELTE sannheten for admin-data: fasit og sluttspill-tips som admin
 * legger inn blir synlig for alle umiddelbart – ingen redeploy.
 *
 * - GET er offentlig (alle leser fasiten som vises på siden uansett).
 * - POST krever admin-passordet, som sjekkes server-side mot ADMIN_PASSWORD.
 */
const ENDPOINT = '/api/state';
const APP = APP_CONFIG.storageSuffix;

export interface RemoteState {
  knockoutTips?: KnockoutStore;
  bonusAnswers?: BonusStore;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Henter delt admin-data fra KV. Returnerer null ved feil (kaller faller tilbake på cache). */
export async function fetchRemoteState(): Promise<RemoteState | null> {
  try {
    const res = await fetch(`${ENDPOINT}?app=${APP}`);
    if (!res.ok) return null;
    return (await res.json()) as RemoteState;
  } catch {
    return null;
  }
}

/**
 * Sjekker et admin-passord mot serveren UTEN å skrive noe (tom POST = ren verifisering).
 * Server-låsen (`ADMIN_PASSWORD`) er eneste sannhet – passordet finnes aldri i klient-bundelen.
 * Returnerer true ved 200 (riktig passord), false ved 401/feil.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}?app=${APP}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Skriver (deler av) admin-data til KV. Krever korrekt passord (server-side sjekk). */
export async function saveRemoteState(password: string, partial: RemoteState): Promise<SaveResult> {
  try {
    const res = await fetch(`${ENDPOINT}?app=${APP}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, ...partial }),
    });
    if (res.status === 401) return { ok: false, error: 'Feil passord – server avviste lagringen.' };
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? `Lagring feilet (${res.status}).` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nettverksfeil ved lagring.' };
  }
}
