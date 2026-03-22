/**
 * Export-only markdown tweaks so embedded plugins match print backgrounds (white page).
 * Does not change vault files — applied to resolved markdown before render/export.
 */

import { slugifyHeadingForAnchor } from "./markdown-heading-slug";

/**
 * Emic-Charts-View builds chart config from `dataProps.options` (see `parseConfig` in that plugin).
 * Top-level `theme:` in the fence YAML is ignored — theme must be under `options.theme`.
 */
function injectEmicChartsOptionsTheme(body: string): string {
	const lines = body.split("\n");
	const optIdx = lines.findIndex((l) => /^\s*options\s*:/.test(l));

	if (optIdx < 0) {
		const trimmed = body.trimEnd();
		if (!trimmed) {
			return "options:\n  theme: emicLight\n";
		}
		return `${trimmed}\n\noptions:\n  theme: emicLight\n`;
	}

	const optLine = lines[optIdx]!;
	const optIndent = optLine.match(/^(\s*)/)?.[1] ?? "";
	let childIndent = `${optIndent}  `;
	for (let j = optIdx + 1; j < lines.length; j++) {
		const l = lines[j]!;
		if (!l.trim()) continue;
		const m = l.match(/^(\s+)/);
		if (!m) break;
		const ind = m[1]!;
		if (ind.length > optIndent.length) {
			childIndent = ind;
			break;
		}
		break;
	}

	const filtered = lines.filter((l, j) => {
		if (j === optIdx) return true;
		const m = l.match(/^(\s*)/);
		const ind = m?.[1] ?? "";
		if (ind.length > optIndent.length && /^\s*theme\s*:/i.test(l)) {
			return false;
		}
		return true;
	});

	const newOptIdx = filtered.findIndex((l) => /^\s*options\s*:/.test(l));
	if (newOptIdx < 0) {
		return body;
	}
	const out = filtered.slice(0, newOptIdx + 1);
	out.push(`${childIndent}theme: emicLight`);
	out.push(...filtered.slice(newOptIdx + 1));
	return out.join("\n");
}

/** Force Emic-Charts-View to use the registered light theme (see Emic-Charts-View `options.theme`). */
export function forceEmicChartsLightThemeForExport(markdown: string): string {
	const lines = markdown.split("\n");
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		const trimmed = line.trim();
		const fenceMatch = /^(`{3,}|~{3,})\s*(.+)$/.exec(trimmed);
		if (fenceMatch) {
			const rest = (fenceMatch[2] ?? "").trim();
			const lang = (rest.split(/\s+/)[0] ?? "").replace(/^[{}]+/, "").toLowerCase();
			if (lang === "emic-charts-view") {
				out.push(line);
				i += 1;
				const body: string[] = [];
				while (i < lines.length) {
					const tl = lines[i]!.trim();
					if ((tl.startsWith("```") || tl.startsWith("~~~")) && /^(`{3,}|~{3,})/.test(tl)) {
						break;
					}
					body.push(lines[i]!);
					i += 1;
				}
				out.push(injectEmicChartsOptionsTheme(body.join("\n")));
				if (i < lines.length) {
					out.push(lines[i]!);
					i += 1;
				}
				continue;
			}
		}
		out.push(line);
		i += 1;
	}
	return out.join("\n");
}

/**
 * Turn Obsidian inline tags `#tag` / `#a/b` into `[#tag](#slug)` so HTML/PDF anchors match headings.
 * Runs after wikilinks are resolved. Skips fenced code and `` `inline code` `` spans.
 * Does not match `#` inside `](...)` link destinations or after `[[` (already converted).
 */
export function expandInlineHashtagsToAnchorLinks(markdown: string): string {
	const lines = markdown.split("\n");
	let inFence = false;
	const out: string[] = [];
	/** Avoid `#` in `]( #fragment )` and similar; skip `[[` contexts left in text. */
	const tagRe =
		/(?<![(/<#[\w\[])#(?![#\s])([a-zA-Z0-9\u00C0-\u024F][a-zA-Z0-9_./\-\u00C0-\u024F]*)/gu;

	for (const line of lines) {
		const trimmedStart = line.trimStart();
		if (trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~")) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		out.push(expandHashtagsOutsideInlineCode(line, tagRe));
	}
	return out.join("\n");
}

function expandHashtagsOutsideInlineCode(line: string, tagRe: RegExp): string {
	const parts = line.split(/(`[^`]*`)/);
	return parts
		.map((part, idx) => {
			if (idx % 2 === 1) return part;
			return part.replace(tagRe, (_full, name: string) => {
				const slug = slugifyHeadingForAnchor(name.replace(/\//g, "-"));
				return `[#${name}](#${slug})`;
			});
		})
		.join("");
}

/** Apply all export-time transforms (single entry point). */
export function applyExportMarkdownTransforms(markdown: string): string {
	let md = forceEmicChartsLightThemeForExport(markdown);
	md = expandInlineHashtagsToAnchorLinks(md);
	return md;
}
