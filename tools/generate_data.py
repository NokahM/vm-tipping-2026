"""
Genererer datalag-filer for begge VM-tipping-appene fra Excel-eksporterte CSV-er.

Inndata (UTF-8 CSV, eksportert fra data/*.xlsx via Excel):
  <csvdir>/<app>_Gruppespill.csv
  <csvdir>/<app>_Kryddersporsmal.csv

Utdata per app (apps/<app>/src/...):
  utils/teamNames.ts      – engelsk (API) -> norsk (Excel) navnemap (felles)
  data/participants.ts    – gruppespill- + krydder-tips per deltaker
  data/bonusQuestions.ts  – de 17 krydderspørsmålene (fasit = null) (felles)

Kjør:  py tools/generate_data.py <csvdir>
"""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPS = ["drammen", "alles"]

# Engelsk API-navn -> norsk Excel-navn (alle 48 lag, gruppe-justert mot API).
TEAM_MAP = {
    "Czechia": "Tsjekkia", "Mexico": "Mexico", "South Africa": "Sør-Afrika", "South Korea": "Sør-Korea",
    "Bosnia-Herzegovina": "Bosnia-Hercegovina", "Canada": "Canada", "Qatar": "Qatar", "Switzerland": "Sveits",
    "Brazil": "Brasil", "Haiti": "Haiti", "Morocco": "Marokko", "Scotland": "Skottland",
    "Australia": "Australia", "Paraguay": "Paraguay", "Turkey": "Tyrkia", "United States": "USA",
    "Curaçao": "Curaçao", "Ecuador": "Ecuador", "Germany": "Tyskland", "Ivory Coast": "Elfenbenskysten",
    "Japan": "Japan", "Netherlands": "Nederland", "Sweden": "Sverige", "Tunisia": "Tunisia",
    "Belgium": "Belgia", "Egypt": "Egypt", "Iran": "Iran", "New Zealand": "New Zealand",
    "Cape Verde Islands": "Kapp Verde", "Saudi Arabia": "Saudi-Arabia", "Spain": "Spania", "Uruguay": "Uruguay",
    "France": "Frankrike", "Iraq": "Irak", "Norway": "Norge", "Senegal": "Senegal",
    "Algeria": "Algerie", "Argentina": "Argentina", "Austria": "Østerrike", "Jordan": "Jordan",
    "Colombia": "Colombia", "Congo DR": "DR Kongo", "Portugal": "Portugal", "Uzbekistan": "Usbekistan",
    "Croatia": "Kroatia", "England": "England", "Ghana": "Ghana", "Panama": "Panama",
}

# Krydderspørsmål som har to svar (string[]).
TWO_ANSWER_QUESTIONS = {7, 8}


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [row for row in csv.reader(f)]


def cell(row, i):
    return row[i].strip() if i < len(row) and row[i] is not None else ""


def parse_group_stage(rows):
    """-> {participant_name: [groupTip, ...]} og bevart deltakerrekkefølge."""
    # Finn header-raden (col0 == "Dato") for å hente deltakernavn + basekolonner.
    header = next(r for r in rows if cell(r, 0) == "Dato")
    participants = []  # (name, base_col)
    col = 8
    while col < len(header) and cell(header, col):
        participants.append((cell(header, col), col))
        col += 4

    tips = {name: [] for name, _ in participants}
    current_group = None
    for r in rows:
        c0 = cell(r, 0)
        if c0 == "Dato":
            g = cell(r, 2)  # "Gruppe A"
            current_group = "GROUP_" + g.split()[-1] if g.startswith("Gruppe") else None
            continue
        if current_group is None or c0.startswith("Poeng") or not cell(r, 2) or not cell(r, 4):
            continue
        home, away = cell(r, 2), cell(r, 4)
        for name, base in participants:
            h, a = cell(r, base), cell(r, base + 2)
            if h == "" or a == "":
                continue  # ingen tip (f.eks. Geir)
            tips[name].append({
                "homeTeam": home, "awayTeam": away, "group": current_group,
                "homeGoals": int(h), "awayGoals": int(a),
            })
    return [name for name, _ in participants], tips


def parse_bonus(rows):
    """-> ({participant: [bonusTip,...]}, [question_meta,...])."""
    header = next(r for r in rows if cell(r, 0) == "Krydderspørsmål")
    participants = []  # (name, base_col)
    col = 5
    while col < len(header) and cell(header, col):
        participants.append((cell(header, col), col))
        col += 2

    answers = {name: [] for name, _ in participants}
    questions = []
    for i, r in enumerate(rows):
        c0 = cell(r, 0)
        if not re.match(r"^\d+\.$", c0):
            continue
        # Ekte spørsmål har en poengcelle som "5p"; sluttspill-plassholderne har tom poengcelle.
        if not re.match(r"^\d+p$", cell(r, 2)):
            continue
        qnum = int(c0[:-1])
        qid = f"q{qnum}"
        questions.append({
            "id": qid,
            "question": cell(r, 1),
            "maxPoints": int(cell(r, 2).replace("p", "")),
            "two": qnum in TWO_ANSWER_QUESTIONS,
        })
        nxt = rows[i + 1] if i + 1 < len(rows) else []
        for name, base in participants:
            first = cell(r, base)
            if qnum in TWO_ANSWER_QUESTIONS:
                second = cell(nxt, base)
                vals = [v for v in (first, second) if v]
                if vals:
                    answers[name].append({"questionId": qid, "answer": vals})
            elif first:
                answers[name].append({"questionId": qid, "answer": first})
    return answers, questions


def j(value):
    return json.dumps(value, ensure_ascii=False)


def write_team_names(app_dir: Path):
    lines = ["// AUTO-GENERERT av tools/generate_data.py – ikke rediger for hånd.",
             "// Engelsk API-navn -> norsk navn (matcher tips i participants.ts).",
             "",
             "export const TEAM_NAME_MAP: Record<string, string> = {"]
    for en, no in TEAM_MAP.items():
        lines.append(f"  {j(en)}: {j(no)},")
    lines += ["};", "",
              "/** Oversetter et engelsk API-lagnavn til norsk. Ukjente navn returneres uendret. */",
              "export function normalizeTeamName(apiName: string): string {",
              "  return TEAM_NAME_MAP[apiName] ?? apiName;",
              "}", ""]
    (app_dir / "src" / "utils" / "teamNames.ts").write_text("\n".join(lines), encoding="utf-8")


def write_bonus_questions(app_dir: Path, questions):
    lines = ["// AUTO-GENERERT av tools/generate_data.py – ikke rediger for hånd.",
             "import type { BonusQuestion } from '../types';",
             "",
             "// Fasit settes til null inntil den avgjøres (via admin-panelet).",
             "export const BONUS_QUESTIONS: BonusQuestion[] = ["]
    for q in questions:
        lines.append(
            f"  {{ id: {j(q['id'])}, question: {j(q['question'])}, "
            f"maxPoints: {q['maxPoints']}, answer: null }},"
        )
    lines += ["];", ""]
    (app_dir / "src" / "data" / "bonusQuestions.ts").write_text("\n".join(lines), encoding="utf-8")


def write_participants(app_dir: Path, names, group_tips, bonus_tips):
    lines = ["// AUTO-GENERERT av tools/generate_data.py – ikke rediger for hånd.",
             "import type { Participant } from '../types';",
             "",
             "export const PARTICIPANTS: Participant[] = ["]
    for name in names:
        lines.append("  {")
        lines.append(f"    name: {j(name)},")
        lines.append("    groupTips: [")
        for t in group_tips.get(name, []):
            lines.append(
                f"      {{ homeTeam: {j(t['homeTeam'])}, awayTeam: {j(t['awayTeam'])}, "
                f"group: {j(t['group'])}, homeGoals: {t['homeGoals']}, awayGoals: {t['awayGoals']} }},"
            )
        lines.append("    ],")
        lines.append("    bonusTips: [")
        for b in bonus_tips.get(name, []):
            lines.append(f"      {{ questionId: {j(b['questionId'])}, answer: {j(b['answer'])} }},")
        lines.append("    ],")
        lines.append("    knockoutTips: [],")
        lines.append("  },")
    lines += ["];", ""]
    (app_dir / "src" / "data" / "participants.ts").write_text("\n".join(lines), encoding="utf-8")


def main():
    csvdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".tmp_xlsx"
    for app in APPS:
        app_dir = ROOT / "apps" / app
        (app_dir / "src" / "utils").mkdir(parents=True, exist_ok=True)
        (app_dir / "src" / "data").mkdir(parents=True, exist_ok=True)

        group_rows = read_csv(csvdir / f"{app}_Gruppespill.csv")
        bonus_rows = read_csv(csvdir / f"{app}_Kryddersporsmal.csv")

        names, group_tips = parse_group_stage(group_rows)
        bonus_tips, questions = parse_bonus(bonus_rows)

        write_team_names(app_dir)
        write_bonus_questions(app_dir, questions)
        write_participants(app_dir, names, group_tips, bonus_tips)

        total_gt = sum(len(v) for v in group_tips.values())
        total_bt = sum(len(v) for v in bonus_tips.values())
        print(f"{app}: {len(names)} deltakere, {total_gt} gruppespill-tips, "
              f"{total_bt} krydder-svar, {len(questions)} spørsmål")


if __name__ == "__main__":
    main()
