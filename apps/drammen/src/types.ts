export type Outcome = 'home' | 'draw' | 'away';

export type Stage =
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

export type MatchStatus = 'FINISHED' | 'SCHEDULED' | 'IN_PLAY' | 'TIMED' | 'PAUSED';

export interface MatchResult {
  apiId: number; // football-data.org sin kamp-ID
  stage: Stage;
  group?: string; // "GROUP_A" etc., kun for gruppespill
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null; // resultat etter 90 min – det tips scores mot
  awayGoals: number | null;
  // Sluttspill som gikk utover 90 min (ekstraomganger/straffer):
  aetHomeGoals?: number | null; // fullt spille-resultat (inkl. ekstraomganger, EKSKL. straffekonk)
  aetAwayGoals?: number | null;
  penHomeGoals?: number | null; // straffesparkkonkurranse
  penAwayGoals?: number | null;
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  status: MatchStatus;
  utcDate: string;
  minute?: number | null; // kampminutt mens den spilles (kun live)
  injuryTime?: number | null; // tilleggstid (f.eks. 90+3)
}

export interface GroupTip {
  // Matchet mot MatchResult via homeTeam + awayTeam + group
  homeTeam: string;
  awayTeam: string;
  group: string;
  homeGoals: number;
  awayGoals: number;
}

export interface KnockoutTip {
  // Matchet mot MatchResult via apiId (settes i admin etter at kampen er kjent)
  apiId: number;
  homeGoals: number;
  awayGoals: number;
}

export interface Participant {
  name: string;
  groupTips: GroupTip[];
  bonusTips: BonusTip[]; // Krydderspørsmål-svar (fra Excel)
  knockoutTips: KnockoutTip[]; // Legges inn via admin-panel per runde
}

export interface BonusTip {
  questionId: string;
  answer: string | string[]; // string[] for spørsmål med to svar (rødt kort etc.)
}

/**
 * Poeng-modus for ADMIN-opprettede krydderspørsmål (q.scoring). De innbakte q1–q20 bruker
 * id-basert spesiallogikk i scoring.ts og setter ikke dette feltet.
 * - `exact`   = eksakt tekstmatch → full pott / 0
 * - `list`    = fasit er flere gyldige svar; deltakerens ene svar i lista → full pott
 * - `perItem` = deltakeren nevner flere; `perItemPoints` per korrekt, opp til `maxPoints`
 * - `number`  = tall innenfor ±`margin` av fasit → full pott
 */
export type BonusScoring = 'exact' | 'list' | 'perItem' | 'number';

export interface BonusQuestion {
  id: string;
  question: string;
  maxPoints: number;
  answer: string | string[] | null; // null = ikke avgjort ennå
  // Kun satt på admin-opprettede spørsmål (id «k…»):
  scoring?: BonusScoring; // poeng-modus (mangler = innbakt q1–q20 med id-basert logikk)
  perItemPoints?: number; // poeng per korrekt element når scoring = 'perItem'
  margin?: number; // ± margin for full pott når scoring = 'number'
  stage?: Stage; // valgfri runde-merkelapp (visning/gruppering)
  custom?: boolean; // true = opprettet via admin (ikke innbakt)
}

export interface ParticipantScore {
  name: string;
  groupPoints: number;
  knockoutPoints: number;
  bonusPoints: number;
  total: number;
  rank: number;
  correctResults: number; // eksakt resultat (3p)
  correctOutcomes: number; // riktig utfall, feil score (1p)
  wrongOutcomes: number; // feil utfall (0p) – kun tellt for spilte kamper med tip
}
