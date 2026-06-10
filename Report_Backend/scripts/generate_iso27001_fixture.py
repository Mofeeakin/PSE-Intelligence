"""
Generates reports/fixtures/iso27001.json from the HTML checklist.
Run once: python scripts/generate_iso27001_fixture.py
"""
import json
import re
import sys
from pathlib import Path

HTML_PATH = Path(__file__).resolve().parent.parent.parent / "Templates" / "iso27001-full-checklist_2 (1).html"
OUT_PATH = Path(__file__).resolve().parent.parent / "reports" / "fixtures" / "iso27001.json"

html = HTML_PATH.read_text(encoding="utf-8")

# ── Pull the JS STANDARD array ───────────────────────────────────────────────
start = html.index("const STANDARD")
start = html.index("[", start)
# find the matching closing bracket by counting depth
depth = 0
pos = start
while pos < len(html):
    if html[pos] == "[":
        depth += 1
    elif html[pos] == "]":
        depth -= 1
        if depth == 0:
            end = pos + 1
            break
    pos += 1
raw_js = html[start:end]

# ── Convert JS object literals → valid JSON ─────────────────────────────────
# 0. Strip JS // line comments
raw_js = re.sub(r"//[^\n]*", "", raw_js)
# 1. JS backtick strings → double-quoted strings
raw_js = re.sub(r"`([^`]*?)`", lambda m: json.dumps(m.group(1)), raw_js)
# 2. Remove trailing commas before } or ]
raw_js = re.sub(r",(\s*[}\]])", r"\1", raw_js)
# 3. Single-quote string values → double-quote
raw_js = re.sub(r":\s*'([^']*)'", lambda m: ': ' + json.dumps(m.group(1)), raw_js)
# 4. Unquoted JS object keys → quoted keys
raw_js = re.sub(r"([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)", r'\1"\2"\3', raw_js)

try:
    clauses_data = json.loads(raw_js)
except json.JSONDecodeError as e:
    print(f"JSON parse error: {e}")
    # Write the intermediate for debugging
    Path("debug_raw.json").write_text(raw_js, encoding="utf-8")
    print("Wrote debug_raw.json for inspection")
    sys.exit(1)

# ── Build Django fixture records ─────────────────────────────────────────────
fixtures = []

# Standard pk=1
fixtures.append({
    "model": "reports.standard",
    "pk": 1,
    "fields": {"code": "ISO27001", "name": "ISO/IEC 27001:2022"}
})

clause_pk = 1
req_pk = 1
clause_order = 0

TAG_MAP = {"m": "mandatory", "r": "recommended", "o": "optional"}

for clause_group in clauses_data:
    num = clause_group.get("num", "")
    title = clause_group.get("title", "")
    desc = clause_group.get("desc", "")
    subclauses = clause_group.get("subclauses", [])

    for sub in subclauses:
        sub_num = sub.get("num", "")
        sub_title = sub.get("title", "")
        items = sub.get("items", [])

        fixtures.append({
            "model": "reports.clause",
            "pk": clause_pk,
            "fields": {
                "standard": 1,
                "code": sub_num,
                "title": sub_title,
                "description": desc,
                "order": clause_order,
            }
        })

        req_order = 0
        for item in items:
            req_tag = TAG_MAP.get(item.get("tag", "m"), "mandatory")
            fixtures.append({
                "model": "reports.requirement",
                "pk": req_pk,
                "fields": {
                    "clause": clause_pk,
                    "code": item.get("id", ""),
                    "text": item.get("text", ""),
                    "action": item.get("action", ""),
                    "expected_evidence": item.get("doc", ""),
                    "tag": req_tag,
                    "order": req_order,
                }
            })
            req_pk += 1
            req_order += 1

            # Also add sub-items as requirements
            for sub_item in item.get("sub", []):
                fixtures.append({
                    "model": "reports.requirement",
                    "pk": req_pk,
                    "fields": {
                        "clause": clause_pk,
                        "code": sub_item.get("id", ""),
                        "text": sub_item.get("text", ""),
                        "action": sub_item.get("action", ""),
                        "expected_evidence": sub_item.get("doc", ""),
                        "tag": "optional",
                        "order": req_order,
                    }
                })
                req_pk += 1
                req_order += 1

        clause_pk += 1
        clause_order += 1

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(fixtures, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Written {len(fixtures)} fixture records to {OUT_PATH}")
print(f"  Standards: 1")
print(f"  Clauses:   {clause_pk - 1}")
print(f"  Requirements: {req_pk - 1}")
