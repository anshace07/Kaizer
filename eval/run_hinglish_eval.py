"""Hinglish text evaluation -> eval/hinglish_text_test.md

Part A (free, deterministic): safety rules on the stress-test sentences in backend/tests/hinglish_cases.py.
Part B (--llm, real LLM calls, hard cap 15): 15 representative sentences through the real extractor,
checking machine + incident type. Saved to eval/hinglish_llm_part_b.md so free re-runs keep it.
Part C (free): the keyword fallback alone on the same 15 sentences. No Gnani calls anywhere.

Run from the repo root:  backend\\.venv\\Scripts\\python eval\\run_hinglish_eval.py [--llm]
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

from app import llm  # noqa: E402
from app.db import DATA_DIR  # noqa: E402
from app.safety import rules  # noqa: E402
from app.services import extract  # noqa: E402
from tests.hinglish_cases import DANGER, SAFE  # noqa: E402

MAX_LLM_CALLS = 15

# (sentence, language, expected machine or None, acceptable incident types, expect confirmation question)
LLM_CASES = [
    ("Machine 14 mein dhuan aa raha hai", "hinglish", "M-14", {"smoke"}, False),
    ("मशीन 9 की भट्टी बहुत गरम हो गई है", "hindi", "M-09", {"overheating"}, False),
    ("Sparks are coming from the LT panel", "english", "M-13", {"sparks_fire"}, False),
    ("compressor se khat khat ki awaaz aa rahi hai", "hinglish", "M-01", {"noise"}, False),
    ("Hydraulic press ke neeche tel tapak raha hai", "hinglish", "M-05", {"oil_leak"}, False),
    ("Conveyor belt bahut zyada hil raha hai", "hinglish", "M-06", {"vibration"}, False),
    ("Chemical mixing tank ke paas gas ki badbu aa rahi hai", "hinglish", "M-11", {"gas_leak"}, False),
    ("पैकेजिंग मशीन से जलने की बदबू आ रही है", "hindi", "M-12", {"smoke", "overheating"}, False),
    ("Machine fourteen main dhua aa raha", "hinglish (STT-style)", "M-14", {"smoke"}, False),
    ("Welding robot cell mein aag lag gayi", "hinglish", "M-10", {"sparks_fire"}, False),
    ("The cooling tower fan is vibrating badly", "english", "M-03", {"vibration"}, False),
    ("Thermic fluid heater ka temperature bahut badh gaya hai", "hinglish", "M-40", {"overheating"}, False),
    ("डीज़ल जनरेटर से तेल लीक हो रहा है", "hindi", "M-02", {"oil_leak"}, False),
    ("teen ya tees number wali machine se awaaz aa rahi hai", "hinglish (ambiguous)", None, {"noise"}, True),
    ("grinding machine ke paas chingari nikal rahi hai", "hinglish", "M-15", {"sparks_fire"}, False),
]


# What happened on the first run (7 Nov 2026) — kept as history, not recomputed.
FINDINGS = [
    "## Findings (7 Nov 2026)",
    "",
    "- **First pass** of the new rules: 83 / 85 danger sentences fired, 1 / 20 safe sentences falsely fired.",
    "  Misses: `it smells like burnt plastic` (no bare \"burnt\"), `panel से jalne की smell` (mixed script inside",
    "  a phrase). False alarm: `current shift mein paanch log hain` (bare \"karant\" normalised to \"current\").",
    "  Fixes: added \"burnt\"; the normaliser maps Hindi helper words (की/का/के/से/में/पर/है) to Latin; kept only",
    "  \"karant maar/lag\" phrases. Result: 85 / 85 and 0 / 20 (part A below).",
    "- **Real LLM run (part B): Gemini rate-limited 14 of 15 requests (HTTP 429)**, so only 1 sentence was really",
    "  extracted by the LLM; the other 14 were handled by the keyword fallback and are labelled so. The budget",
    "  (15 calls) was used up, so the LLM part was not retried. The rules fired on every danger sentence either way.",
    "- The one part-B failure (`पैकेजिंग मशीन से जलने की बदबू`: no machine, typed as gas) was fixed in the",
    "  fallback: machine names are now matched, M-12 got the aliases \"packaging machine\" / \"पैकेजिंग मशीन\",",
    "  and \"जलने की\" counts as smoke. Part C shows the fallback on the same 15 sentences after the fix.",
    "",
]


def part_a() -> tuple[list[str], dict]:
    misses = [(s, r, st, [h["rule_id"] for h in rules.check(s)]) for s, r, st in DANGER
              if r not in [h["rule_id"] for h in rules.check(s)]]
    false_alarms = [(s, [h["rule_id"] for h in rules.check(s)]) for s in SAFE if rules.check(s)]
    by_style, by_rule = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    for s, r, st in DANGER:
        ok = r in [h["rule_id"] for h in rules.check(s)]
        by_style[st][0] += ok
        by_style[st][1] += 1
        by_rule[r][0] += ok
        by_rule[r][1] += 1
    hit = len(DANGER) - len(misses)
    lines = [
        "## A. Safety rules stress test (no Gnani, no LLM)",
        "",
        f"- Danger sentences that fired the right rule: **{hit} / {len(DANGER)}** ({hit / len(DANGER):.0%})",
        f"- Safe sentences that wrongly fired: **{len(false_alarms)} / {len(SAFE)}**",
        "",
        "| Rule | Fired / total |", "|---|---|",
        *[f"| {r} | {a} / {b} |" for r, (a, b) in sorted(by_rule.items())],
        "", "| Style | Fired / total |", "|---|---|",
        *[f"| {st} | {a} / {b} |" for st, (a, b) in sorted(by_style.items())],
        "",
    ]
    if misses:
        lines += ["**Misses:**", *[f"- `{s}` ({st}) expected {r}, got {got}" for s, r, st, got in misses], ""]
    if false_alarms:
        lines += ["**False alarms:**", *[f"- `{s}` fired {got}" for s, got in false_alarms], ""]
    return lines, {"hit": hit, "total": len(DANGER), "false": len(false_alarms), "safe": len(SAFE)}


def part_b() -> list[str]:
    load_dotenv(ROOT / "backend" / ".env")
    machines = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]
    calls = Counter()
    real_client = llm._client

    def counting_client(*args, **kwargs):  # counts every real request, including invalid-JSON retries
        client = real_client(*args, **kwargs)
        create = client.chat.completions.create

        def counted(**kw):
            if calls["n"] >= MAX_LLM_CALLS:
                raise RuntimeError("LLM call budget reached")
            calls["n"] += 1
            return create(**kw)
        client.chat.completions.create = counted
        return client
    llm._client = counting_client

    rows, ok_machine, ok_type, ok_both = [], 0, 0, 0
    for text, lang, want_m, want_types, want_q in LLM_CASES:
        r = extract.analyse(text, machines)
        ex = r["extraction"]
        m_ok = (ex["machine_id"] is None and ex["confirmation_required"]) if want_q else ex["machine_id"] == want_m
        t_ok = ex["incident_type"] in want_types
        ok_machine += m_ok
        ok_type += t_ok
        ok_both += m_ok and t_ok
        got_m = ex["machine_id"] or (f"none → asks: {ex['confirmation_question']}" if ex["confirmation_required"] else "none")
        rows.append(f"| {text} | {lang} | {want_m or 'ask'} / {'/'.join(sorted(want_types))} | {got_m} / "
                    f"{ex['incident_type']} | {r['extractor']}{' (fallback: ' + r['fallback_reason'] + ')' if r['fallback_reason'] else ''} "
                    f"| {r['severity']} ({r['severity_decided_by']}) | {'✅' if m_ok and t_ok else '❌'} |")
    n = len(LLM_CASES)
    return [
        "## B. Real extractor on 15 representative sentences (Gemini `" + llm.model_name() + "`)",
        "",
        f"- Machine correct (or correctly asked when ambiguous): **{ok_machine} / {n}**",
        f"- Incident type correct: **{ok_type} / {n}**",
        f"- Both correct: **{ok_both} / {n}**",
        f"- Real LLM requests made: **{calls['n']}** (cap {MAX_LLM_CALLS}); Gnani calls: 0",
        "",
        "| Sentence | Language | Expected machine / type | Got machine / type | Extractor | Final severity | OK |",
        "|---|---|---|---|---|---|---|",
        *rows,
        "",
        "Single run, 15 hand-written synthetic sentences — this is a smoke check, not an accuracy figure.",
        "",
    ]


def part_c() -> list[str]:
    """The keyword fallback alone (what runs when the LLM is down) on the same 15 sentences. Offline."""
    machines = json.loads((DATA_DIR / "machines.json").read_text(encoding="utf-8"))["machines"]
    rows, ok = [], 0
    for text, lang, want_m, want_types, want_q in LLM_CASES:
        ex = extract.tidy(extract.keyword_fallback(text, machines), machines)
        m_ok = (ex.machine_id is None and ex.confirmation_required) if want_q else ex.machine_id == want_m
        good = m_ok and ex.incident_type in want_types
        ok += good
        rows.append(f"| {text} | {want_m or 'ask'} / {'/'.join(sorted(want_types))} | "
                    f"{ex.machine_id or 'none (asks)'} / {ex.incident_type} | {'✅' if good else '❌'} |")
    return ["## C. Keyword fallback alone on the same 15 sentences (offline, no LLM)", "",
            f"- Machine and type both correct: **{ok} / {len(LLM_CASES)}**",
            "- Caveat: the same person wrote these sentences and the keyword lists, so this flatters the fallback.", "",
            "| Sentence | Expected | Got | OK |", "|---|---|---|---|", *rows, ""]


def main():
    lines = [f"# Hinglish text test — {date.today().isoformat()}", "",
             "All sentences are synthetic (written for testing). No audio, no Gnani calls.", "",
             *FINDINGS]
    a_lines, a = part_a()
    lines += a_lines
    part_b_file = ROOT / "eval" / "hinglish_llm_part_b.md"
    if "--llm" in sys.argv:
        b_lines = part_b()
        part_b_file.write_text("\n".join(b_lines), encoding="utf-8")
    if part_b_file.exists():
        lines += [part_b_file.read_text(encoding="utf-8"), ""]
    lines += part_c()
    out = ROOT / "eval" / "hinglish_text_test.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"A: {a['hit']}/{a['total']} danger fired, {a['false']}/{a['safe']} false alarms -> {out}")


if __name__ == "__main__":
    main()
