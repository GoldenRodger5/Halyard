#!/usr/bin/env python3
"""
Instance the bundled variable fonts into static cuts Satori can parse. §265.

Satori's parser (`@shuding/opentype.js`) reads the variable-font `fvar` table
against `font.names` and throws `Cannot read properties of undefined (reading
'256')` on every one of these families — 256/257/264 are nameIDs, not glyph
indices. Pinning *every* axis removes `fvar` and the parse succeeds.

Pinning `wght` alone is not enough: Fraunces carries opsz/SOFT/WONK and
Bricolage opsz/wdth, and any unpinned axis keeps the table.

Remotion renders the variable originals fine — a browser does not use this
parser — which is exactly why the gap survived unnoticed.

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools
    /tmp/fontenv/bin/python scripts/build-static-fonts.py
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = "packages/render/assets/fonts"
JOBS = {
    "Archivo-Variable.ttf": ("Archivo", [500, 700, 800]),
    "Bricolage-Variable.ttf": ("Bricolage", [600, 700, 800]),
    "DMSans-Variable.ttf": ("DMSans", [400, 500, 700]),
    "Fraunces-Variable.ttf": ("Fraunces", [400, 600, 700]),
    "Sora-Variable.ttf": ("Sora", [400, 600, 700, 800]),
}


def main() -> None:
    out_dir = os.path.join(FONTS, "static")
    os.makedirs(out_dir, exist_ok=True)
    for src, (name, weights) in JOBS.items():
        for weight in weights:
            font = TTFont(os.path.join(FONTS, src))
            # Every axis pinned: wght to the cut, the rest to their default.
            location = {
                a.axisTag: (weight if a.axisTag == "wght" else a.defaultValue)
                for a in font["fvar"].axes
            }
            instancer.instantiateVariableFont(
                font, location, inplace=True, updateFontNames=False
            )
            path = os.path.join(out_dir, f"{name}-{weight}.ttf")
            font.save(path)
            assert "fvar" not in TTFont(path), f"{path} kept fvar; Satori will refuse it"
            print(f"{path:<52} {os.path.getsize(path):>8} bytes")


if __name__ == "__main__":
    main()
