# Typefaces bundled with @halyard/render

Every face here is under the SIL Open Font License 1.1 (`OFL.txt`), which
permits bundling and embedding in rendered video and images, including
commercial use, provided the font itself is not sold on its own and the
licence travels with it. That is what this file is for.

Fetched from `github.com/google/fonts` (the upstream sources, not the CDN's
unicode-range subsets — those are partial faces and produce missing glyphs).

| File | Family | Axes | Upstream |
|---|---|---|---|
| `Inter-Regular.woff`, `Inter-SemiBold.woff` | Inter | 400, 600 | pre-existing |
| `InstrumentSerif-Regular.ttf` | Instrument Serif | 400 | pre-existing |
| `Archivo-Variable.ttf` | Archivo | wdth 62–125, wght 100–900 | `ofl/archivo` |
| `Fraunces-Variable.ttf` | Fraunces | SOFT, WONK, opsz, wght 100–900 | `ofl/fraunces` |
| `Bricolage-Variable.ttf` | Bricolage Grotesque | opsz, wdth, wght 200–800 | `ofl/bricolagegrotesque` |
| `Sora-Variable.ttf` | Sora | wght 100–800 | `ofl/sora` |
| `DMSans-Variable.ttf` | DM Sans | opsz, wght 100–1000 | `ofl/dmsans` |

Variable faces deliberately: one file covers a whole weight range, so a
typography system can ask for 800 without a second download, and the render
package stays small enough to bundle.
