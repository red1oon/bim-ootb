#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — W9 AI-GROUNDED judge (prompts/FIND_ASK_ANSWERS.md §J). Read the log after every run.
#
# ISSUE THIS PROVES OR DISPROVES: an outside AI, handed only our saved answers workbook and our canned
# prompt, could state numbers the file never gave — the exact failure the Ask workbook exists to prevent.
#
# Usage: judge_external_ai.py <workbook.xlsx> <ai_answers.json> <questions.json>
#   questions.json : [{"id":..., "question":..., "trap": bool}]
#   ai_answers.json: [{"id":..., "answer": "...", "not_in_file": bool, "cited_evidence": ["..."]}]
# PASS iff (a) every number in every answer is in the workbook (exact, or a rounding / thousand /
# million scaling of a workbook number), (b) each answerable question cites >=1 string found verbatim in
# the workbook, (c) every trap has not_in_file=true and states no number that is not in the question.
# INCONCLUSIVE (exit 2) when the AI returned no answers.
import json, re, sys
import openpyxl

NUM = re.compile(r'(?<![A-Za-z_])\d[\d,]*(?:\.\d+)?')

def nums(text):
    out = []
    for m in NUM.findall(str(text)):
        try: out.append(float(m.replace(',', '')))
        except ValueError: pass
    return out

def main():
    wb_path, ans_path, q_path = sys.argv[1:4]
    wb = openpyxl.load_workbook(wb_path, data_only=True)
    cells, wbnums = [], set()
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            for v in row:
                if v is None: continue
                cells.append(str(v))
                for n in ([float(v)] if isinstance(v, (int, float)) else nums(v)):
                    wbnums.add(round(n, 6))
    corpus = '\n'.join(cells)
    # Names are not figures: a short workbook label that carries a digit ("Level 1", "Level 7A TOS") is
    # removed from the answer text before numbers are read, so a refusal that NAMES a storey is not
    # judged as stating a number. Only labels that exist verbatim in the workbook are removed.
    labels = sorted({c for c in cells if len(c) <= 40 and re.search(r'[A-Za-z]', c) and re.search(r'\d', c)}, key=len, reverse=True)
    def strip_labels(t):
        for l in labels:
            t = t.replace(l, ' ')
        return t

    def grounded(n):
        for w in wbnums:
            for scale in (1, 1e3, 1e6):
                s = w / scale
                for d in (0, 1, 2):
                    if abs(round(s, d) - n) < 1e-9: return True
            if abs(w - n) < 1e-9: return True
        return False

    qs = {q['id']: q for q in json.load(open(q_path))}
    ans = json.load(open(ans_path))
    print(f'§W9_SCOPE workbook={wb_path} sheets={len(wb.worksheets)} cells={len(cells)} numbers={len(wbnums)} questions={len(qs)} answers={len(ans)}')
    if not ans:
        print('§W9_VERDICT INCONCLUSIVE — the AI returned no answers, nothing was judged'); sys.exit(2)
    fails = 0
    for a in ans:
        q = qs.get(a.get('id'))
        if not q:
            print(f"§W9_Q id={a.get('id')} FAIL unknown question id"); fails += 1; continue
        text = a.get('answer', '')
        qnums = set(nums(q['question']))
        stated = [n for n in nums(strip_labels(text)) if n not in qnums]
        ungrounded = [n for n in stated if not grounded(n)]
        cites = [c for c in (a.get('cited_evidence') or []) if c and str(c).strip()]
        cites_found = [c for c in cites if str(c).strip() in corpus]
        if q.get('trap'):
            ok = bool(a.get('not_in_file')) and not stated
            why = f"not_in_file={a.get('not_in_file')} statedNumbers={stated[:6]}"
        else:
            ok = (not a.get('not_in_file')) and not ungrounded and len(cites_found) >= 1
            why = f"numbers={len(stated)} ungrounded={ungrounded[:6]} cites={len(cites)} citesInFile={len(cites_found)}"
        if not ok: fails += 1
        print(f"§W9_Q id={q['id']} {'TRAP' if q.get('trap') else 'ANSWERABLE'} {'PASS' if ok else 'FAIL'} {why} answer=\"{text[:220]}\"")
    print(f"§W9_VERDICT {'PASS' if fails == 0 else 'FAIL'} judged={len(ans)} fail={fails}")
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
