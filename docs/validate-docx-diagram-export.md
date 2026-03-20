# Validate DOCX diagram export (are we on the right path?)

Use this after **`npm run build`** and copying the plugin into your vault.

## 1. Confirm the right code is running

- Plugin folder under `.obsidian/plugins/…` has a fresh **`main.js`** (check modified time right after build).
- Reload Obsidian (or restart) after replacing **`main.js`**.

## 2. Capture runtime evidence (Obsidian)

Open **Developer Tools** (Ctrl+Shift+I) → **Console**, then export DOCX.

**Look for:**

| Log | What it means |
|-----|----------------|
| `[DOCX-diagram] markers=N allSvgCanvas=M` | `N` should match how many Mermaid/diagram fences you expect. `M` should be > 0 if the preview actually has SVG/canvas output. |
| `[DOCX-diagram] idx=k captured bytes=B` | Each diagram index should get a **non-trivial** `B` (thousands+ bytes is typical for a real PNG). |
| `[DOCX-diagram] idx=k capture failed` | That index did not produce a PNG in the prerender queue. |
| `[DOCX-export] use prerendered diagram bytes=B` | Exporter used the **slot for that fence index** (see below). |
| `[DOCX-export] fallback renderPluginFenceToPng` | That slot was `null`/invalid or capture failed → fallback path. |

**Index alignment:** prerender uses **one array slot per diagram fence** (same order as ``` in the markdown). A failed capture leaves that slot `null` → **only that fence** falls back; earlier successes are **not** shifted onto the wrong diagram.

**Right path:** `markers` = diagram fence count; each `idx` with a diagram either **captured** (large bytes) or **fallback** for that same idx; you should **not** see two prerenders then **only** fallbacks unless slots 0–1 are actually null.

**Wrong path:** many **no target element** / **capture failed** for early idx → still fix capture/DOM; but wrong-image swaps from queue `shift()` should be gone.

## 3. Inspect the `.docx` file (offline)

```bash
python scripts/analyze-docx-media.py "path/to/exported.docx"
```

Install **Pillow** (`pip install pillow`) so PNG **pct** (non-white %) is computed.

**Right path:**

- Every diagram PNG has **`pct` clearly above 0** (e.g. tens of % for typical dark-on-light diagrams).
- **Embed reuse** section: either **one row per diagram** (each `rId` used once), *or* repeated `rId` only when **pct > 0** (same real image reused on purpose).

**Wrong path (matches “blank boxes” hypothesis):**

- Any PNG with **`pct: 0.0`**.
- That same file’s **`rId` used many times** → one **blank** bitmap shared by many placeholders (identical failed captures).

## 4. Interpretation

| Console | Analyzer | Conclusion |
|---------|----------|------------|
| Good captures, big bytes | All PNGs pct > 0 | Export path OK; if Word still looks wrong, look at layout/theme. |
| Good captures | Some pct = 0 | Bug **after** capture (corruption) — less common. |
| Failures / small bytes | pct = 0 + one rId × many | **Capture / mapping** still broken — hypothesis holds. |
| Many fallbacks | Mixed | Queue order or fence detection doesn’t match markdown actually exported. |

## 5. Optional: compare HTML/PDF vs DOCX

If **HTML/PDF** shows diagrams but **DOCX** does not using the **same** resolved markdown, the gap is in **`DocxExporter` / `renderPluginFenceToSvg`** (and SVG→PNG in the exporter), not in Mermaid in the note.
