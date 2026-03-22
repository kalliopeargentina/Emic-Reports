# Emic Report Architect

**Emic Report Architect** is an [Obsidian](https://obsidian.md) community plugin that lets you **combine multiple notes (and whole folders)** into one **styled report**, then **preview** it and **export** to **PDF** and/or **DOCX**—with academic-style layout options, optional cover page, table of contents, and customizable appearance.

> **Desktop only** — the plugin is marked `isDesktopOnly` because export uses desktop capabilities (e.g. PDF generation).

---

## Features

### Report projects

- **Saved reports** — Each report is a project: ordered **sections** (notes or folders), export options, cover settings, and a **style template**. Projects are stored in the plugin’s data area (not as ordinary vault notes).
- **Switch, create, delete** — From the **Report composer**, use the report dropdown, **New report**, and **Delete** (with confirmation).
- **Auto-save on edits** — Many changes save as you go; **Save** forces a save and refreshes the saved list.

### Structure (notes and folders)

- **Add the active note** or **pick a folder** to include all Markdown under that folder (with hierarchy-aware heading levels).
- **Drag and drop** Markdown notes onto the drop zone (and related path resolution from copied links).
- **Reorder** sections in the tree; per-node options typically include inclusion, **page breaks**, **indent**, **heading offset** (shift heading levels under folder hierarchy), **exclude from TOC**, and **asset policy** (inline vs linked images).

### Styling and templates

- **Built-in academic preset** plus **vault templates** — JSON style files live in a folder you choose (see **Settings**).
- **Style template editor** — Edit typography, colors, callouts, blockquotes, code highlighting, math scaling, images, layout tokens, and more.
- **Style preview** — Live preview of template changes (opens beside the template editor when you use the palette ribbon/command).

### Cover, TOC, and layout

- **Cover page** — Optional; configure title, subtitle, and related fields in **Edit cover**.
- **Table of contents** — Optional linked outline **after the cover** (preview and PDF); respects **exclude from TOC** on nodes.
- **Section numbering** — Headings can show hierarchical section numbers aligned with document structure (where supported in the pipeline).
- **Paper size** — A4, Letter, Legal, and custom sizes; portrait/landscape; margins and **page numbers** in export profile.

### Export and preview

- **Formats** — **PDF**, **DOCX**, or **both** (per report).
- **Preview** — Paginated preview modal (optional **Open preview on export** in settings).
- **Output folder** — Default vault folder for exports (created if missing).

### Markdown and media fidelity (high level)

The pipeline aims to preserve common Obsidian/Markdown constructs in exports, including:

- **Wikilinks**, Markdown links, and **inline tags** as styled links where appropriate  
- **Callouts** (including expanded foldable callouts in preview/export)  
- **Code blocks** with **syntax highlighting** (HTML/PDF/DOCX)  
- **Math** (LaTeX-style content rasterized or rendered for DOCX/PDF as implemented)  
- **Emic charts** / diagram-style content where integrated  
- **Images** and embeds, **footnotes**, **tables**, **blockquotes**, **highlights**, **thematic breaks** (`---`), and **`<details>`** blocks (flattened for document-style output)  

Exact behavior can vary by format (PDF vs DOCX); use **Preview** to verify before sharing files.

---

## How to use

### 1. Install and enable

- **Community plugins** — Search for **Emic Report Architect** (`emic-reports`) and install, or  
- **Manual** — Copy `main.js`, `styles.css`, and `manifest.json` into  
  `YourVault/.obsidian/plugins/emic-reports/`  
  Then enable the plugin under **Settings → Community plugins**.

### 2. Open the report composer

- Click the **file output** ribbon icon (**Open report composer**), or  
- Command palette: **Open report composer**

Build your report:

1. Choose or create a **report** from the dropdown (**New report** if needed).  
2. Set **Style template**, **paper size**, and **export format** (PDF / DOCX / both).  
3. Toggle **Include frontmatter**, **Table of contents**, and **Enable cover page** as needed; use **Edit cover** when the cover is on.  
4. Add sections: **Add active note**, **Add folder**, or **drag and drop** notes.  
5. Adjust the **Report structure** tree (order and per-node options).  
6. Use **Preview** to check layout, then **Export** to write files to your **default output folder** (see settings).  
7. **Save** anytime; **Delete** removes the current saved report (after confirmation).

### 3. Edit style templates

- **Palette** ribbon: **Open style template editor**, or command **Open style template editor**.  
- A **style preview** split opens next to the editor when possible.  
- Save templates as JSON in your configured **Folder for templates** so reports can select them.

### 4. Commands (command palette)

| Command | What it does |
|--------|----------------|
| **Open report composer** | Opens the main report UI. |
| **Open style template editor** | Opens template editor (+ preview). |
| **Open style preview** | Opens only the style preview pane. |
| **Export active report project** | Exports the report currently active in the composer (or the first available if none selected). |
| **Print active note** | One-shot export of the **currently open Markdown note** using the **default template for quick print** and **default export format** from settings. |
| **Export saved report** | Pick any saved report from a list and export it (uses that report’s format settings). |

### 5. Plugin settings

Under **Settings → Community plugins → Emic Report Architect**:

- **Default output folder** — Where PDF/DOCX files are written.  
- **Default template for quick print** — Used by **Print active note**.  
- **Folder for templates** — Vault path for custom style template JSON files.  
- **Default paper size** — A4 / Letter / Legal (defaults for new behavior where applicable).  
- **Default export format** — Pre-selection for export UI (PDF / DOCX / both).  
- **Open preview on export** — Whether to show the preview modal before exporting.

---

## Privacy and data

- The plugin works **locally** inside your vault; it does not send your notes to a remote service for core reporting/export.  
- Exports are written to paths you configure inside the vault (or vault-accessible locations Obsidian allows).

---

## Development

For maintainers and contributors:

```bash
npm install
npm run build    # production bundle
npm run dev      # watch mode
```

See [`AGENTS.md`](./AGENTS.md) for project conventions (esbuild, `src/` layout, manifest, and release notes).

---

## License

See the repository’s license file (e.g. `LICENSE`).
