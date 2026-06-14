import data from '../data/broadcasters.json';

export type Channel = 'NRK' | 'TV2';

// apiId (som streng) → norsk kringkaster. Vedlikeholdes manuelt fra NRK/TV2 sitt sendeskjema.
const MAP = data as Record<string, Channel>;

/** Norsk kringkaster for en kamp, eller null hvis ikke registrert. */
export function broadcaster(apiId: number): Channel | null {
  return MAP[String(apiId)] ?? null;
}
