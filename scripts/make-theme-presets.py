"""Build presets/presets.json from the OVP design-language tokens.

Author: Badr Abardazzou. Source: ../report-themes/tokens/DL-*.json and the
"made for" column of ../report-themes/README.md. The data colour order is the
same cycle() as report-themes/generate.py, so a preset built here matches the
theme files published in that repo.

Run:
  python scripts/make-theme-presets.py   (with github.com/babarda/report-themes cloned next to this repo)
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT.parent / "report-themes"
OUT = ROOT / "presets" / "presets.json"

EXTRA_ROLES = ("warning", "info", "water", "indigo")


def cycle(pal):
    """Copy of report-themes/generate.py cycle(): primary, primaryDark, muted, benchmark or hairline, positive, negative, extras."""
    cols = [pal["primary"]]
    if "primaryDark" in pal:
        cols.append(pal["primaryDark"])
    cols.append(pal["muted"])
    cols.append(pal.get("benchmark", pal["hairline"]))
    cols += [pal["positive"], pal["negative"]]
    for role in EXTRA_ROLES:
        if role in pal:
            cols.append(pal[role])
    seen = set()
    return [c.upper() for c in cols if not (c in seen or seen.add(c))]


def first_family(stack):
    return stack.split(",")[0].strip().strip("'\"")


def made_for():
    rows = {}
    text = (THEMES / "README.md").read_text(encoding="utf-8")
    for m in re.finditer(r"^\| \*\*([A-Z]+)\*\* \| [^|]+ \| ([^|]+) \|$", text, re.M):
        rows[m.group(1)] = m.group(2).strip()
    return rows


def main():
    uses = made_for()
    presets = []
    for f in sorted((THEMES / "tokens").glob("DL-*.json")):
        tok = json.loads(f.read_text(encoding="utf-8"))
        pal = tok["palette"]
        name = tok["name"]
        presets.append({
            "id": name.lower(),
            "code": tok["code"],
            "name": name,
            "motto": tok["philosophy"]["motto"],
            "madeFor": uses.get(name, ", ".join(tok.get("occasions", [])[:2])),
            "brand": {
                "name": name,
                "colors": cycle(pal),
                "background": pal["background"].upper(),
                "panel": pal.get("panel", pal["background"]).upper(),
                "ink": pal["ink"].upper(),
                "body": pal["body"].upper(),
                "hairline": pal["hairline"].upper(),
                "gridline": pal["gridline"].upper(),
                "good": pal["positive"].upper(),
                "bad": pal["negative"].upper(),
                "neutral": pal.get("warning", pal["muted"]).upper(),
                "fontHeading": first_family(tok["fonts"]["display"]["family"]),
                "fontBody": first_family(tok["fonts"]["body"]["family"]),
            },
        })
    doc = {
        "author": "Badr Abardazzou",
        "source": "https://github.com/babarda/report-themes (OVP design languages DL-01 to DL-16)",
        "presets": presets,
    }
    OUT.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(presets)} presets to {OUT}")


if __name__ == "__main__":
    main()
