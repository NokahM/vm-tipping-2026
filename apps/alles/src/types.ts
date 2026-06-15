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
  homeGoals: number | null;
  awayGoals: number | null;
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

export interface BonusQuestion {
  id: string;
  question: string;
  maxPoints: number;
  answer: string | string[] | null; // null = ikke avgjort ennå
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
