import { TFile, type App } from "obsidian";
import { getPrimaryMarkdownSourcePath, type ReportProject } from "../domain/report-project";
import { mergeStyleTokens } from "../domain/style-template";
import { expandHighlightsInMarkdown } from "./highlight-export";
import { slugifyHeadingForAnchor } from "./markdown-heading-slug";

export type LinkResolveOptions = {
	/** When true, keep ==highlight== as Markdown for the DOCX path (parser handles it). */
	skipHighlightHtml?: boolean;
};

const MAX_EMBED_DEPTH = 12;

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"bmp",
	"svg",
]);

type ParsedEmbedLink = {
	/** Path passed to metadataCache (no #anchor). */
	path: string;
	headingRef?: string;
	blockId?: string;
	/** Image width/height hint after | */
	sizeSpec?: string;
};

function parseEmbedLinkBody(linkBody: string): ParsedEmbedLink {
	const pipeIdx = linkBody.indexOf("|");
	const main = (pipeIdx >= 0 ? linkBody.slice(0, pipeIdx) : linkBody).trim();
	const sizeSpec = pipeIdx >= 0 ? linkBody.slice(pipeIdx + 1).trim() : undefined;

	const hashIdx = main.indexOf("#");
	if (hashIdx < 0) {
		return { path: main, sizeSpec };
	}

	const path = main.slice(0, hashIdx).trim();
	const anchor = main.slice(hashIdx + 1).trim();
	if (anchor.startsWith("^")) {
		return { path, blockId: anchor.slice(1).trim(), sizeSpec };
	}
	return { path, headingRef: anchor, sizeSpec };
}

function headingsMatch(title: string, ref: string): boolean {
	const t = title.trim();
	const r = ref.trim();
	if (t.localeCompare(r, undefined, { sensitivity: "accent" }) === 0) return true;
	if (slugifyHeadingForAnchor(t) === slugifyHeadingForAnchor(r)) return true;
	return false;
}

function escapeMarkdownLinkLabel(label: string): string {
	return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

/** Split `[[path#ref|alias]]` into parts (main segment only, before first `|`). */
function parseWikiLinkForReplacer(linkBody: string): {
	pathPart: string;
	headingRef?: string;
	blockId?: string;
	alias?: string;
} {
	const pipeIdx = linkBody.indexOf("|");
	const main = (pipeIdx >= 0 ? linkBody.slice(0, pipeIdx) : linkBody).trim();
	const alias = pipeIdx >= 0 ? linkBody.slice(pipeIdx + 1).trim() : undefined;
	const p = parseEmbedLinkBody(main);
	return { pathPart: p.path, headingRef: p.headingRef, blockId: p.blockId, alias };
}

function extractHeadingSection(markdown: string, headingRef: string): string {
	const lines = markdown.split("\n");
	let start = -1;
	let sectionLevel = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const hm = /^(#{1,6})\s+(.+)$/.exec(line.trim());
		if (!hm) continue;

		const hashes = hm[1] ?? "#";
		const level = hashes.length;
		const title = (hm[2] ?? "").trim();

		if (start < 0) {
			if (headingsMatch(title, headingRef)) {
				start = i;
				sectionLevel = level;
			}
			continue;
		}

		if (level <= sectionLevel) {
			return lines.slice(start, i).join("\n").trim();
		}
	}

	if (start >= 0) {
		return lines.slice(start).join("\n").trim();
	}
	return `*[Section not found: ${headingRef}]*`;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlockById(markdown: string, blockId: string): string {
	const lines = markdown.split("\n");
	const re = new RegExp(`\\^${escapeRegExp(blockId)}\\s*$`);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (!re.test(line.trimEnd())) continue;

		const chunk: string[] = [line];
		for (let j = i + 1; j < lines.length; j++) {
			const next = lines[j] ?? "";
			if (next.trim() === "") break;
			chunk.push(next);
		}
		return chunk.join("\n").trim();
	}
	return `*[Block not found: ^${blockId}]*`;
}

/**
 * Finds the next `![[...]]` that is not inside a ``` fenced block (toggle on ``` lines).
 */
function findNextWikiEmbedOutsideFences(markdown: string): {
	index: number;
	linkBody: string;
	fullLength: number;
} | null {
	let inFence = false;
	let i = 0;

	while (i < markdown.length) {
		const lineStart = i;
		const lineEnd = markdown.indexOf("\n", i);
		const end = lineEnd === -1 ? markdown.length : lineEnd;
		const line = markdown.slice(lineStart, end);

		const trimmedStart = line.trimStart();
		if (trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~")) {
			inFence = !inFence;
			i = end === markdown.length ? end : end + 1;
			continue;
		}

		if (!inFence) {
			let search = lineStart;
			while (search < end) {
				const embedStart = markdown.indexOf("![[", search);
				if (embedStart < 0 || embedStart >= end) break;

				const close = markdown.indexOf("]]", embedStart + 3);
				if (close < 0) return null;

				return {
					index: embedStart,
					linkBody: markdown.slice(embedStart + 3, close),
					fullLength: close + 2 - embedStart,
				};
			}
		}

		i = end === markdown.length ? end : end + 1;
	}

	return null;
}

function replaceWikiLinksOutsideCode(markdown: string, replace: (linkBody: string) => string): string {
	const lines = markdown.split("\n");
	let inFence = false;

	return lines
		.map((line) => {
			const trimmedStart = line.trimStart();
			if (trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~")) {
				inFence = !inFence;
				return line;
			}
			if (inFence) return line;

			// Avoid transforming wikilinks inside inline code spans (`...`).
			let out = "";
			let i = 0;
			let inInlineCode = false;
			while (i < line.length) {
				const ch = line[i] ?? "";
				if (ch === "`") {
					inInlineCode = !inInlineCode;
					out += ch;
					i += 1;
					continue;
				}
				if (!inInlineCode && ch === "[" && line[i + 1] === "[") {
					const close = line.indexOf("]]", i + 2);
					if (close > i) {
						const body = line.slice(i + 2, close);
						out += replace(body);
						i = close + 2;
						continue;
					}
				}
				out += ch;
				i += 1;
			}
			return out;
		})
		.join("\n");
}

export class LinkResolver {
	constructor(private app: App) {}

	async resolve(_project: ReportProject, markdown: string, options?: LinkResolveOptions): Promise<string> {
		const withEmbeds = await this.expandNoteEmbeds(markdown, _project, "", 0, new Set());

		const tokens = mergeStyleTokens(_project.styleTemplate.tokens);
		const afterHighlights = options?.skipHighlightHtml
			? withEmbeds
			: expandHighlightsInMarkdown(withEmbeds, tokens.highlightDefaultBackground);

		const sourcePath = getPrimaryMarkdownSourcePath(_project);

		const withWikiLinks = replaceWikiLinksOutsideCode(afterHighlights, (linkBody: string) => {
			const { pathPart, headingRef, blockId, alias } = parseWikiLinkForReplacer(linkBody);

			const resolveFile = (): TFile | null => {
				if (pathPart) {
					return this.app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
				}
				const cur = this.app.vault.getAbstractFileByPath(sourcePath);
				return cur instanceof TFile ? cur : null;
			};

			if (blockId) {
				const file = resolveFile();
				if (!file) return alias ?? linkBody;
				const href = encodeURI(file.path);
				const label = alias?.trim() || file.basename;
				return `[${escapeMarkdownLinkLabel(label)}](${href})`;
			}

			if (headingRef) {
				const fragment = slugifyHeadingForAnchor(headingRef);
				if (!pathPart) {
					const label = alias?.trim() || headingRef;
					return `[${escapeMarkdownLinkLabel(label)}](#${fragment})`;
				}
				const file = this.app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
				if (!file) return alias?.trim() ?? linkBody;
				const label = alias?.trim() || headingRef;
				return `[${escapeMarkdownLinkLabel(label)}](${encodeURI(file.path)}#${fragment})`;
			}

			const file = this.app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
			if (!file) return alias?.trim() ?? pathPart;
			const href = encodeURI(file.path);
			const label = alias?.trim() || file.basename;
			return `[${escapeMarkdownLinkLabel(label)}](${href})`;
		});

		return withWikiLinks;
	}

	private isImageFile(file: TFile): boolean {
		return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
	}

	private async expandNoteEmbeds(
		markdown: string,
		project: ReportProject,
		sourcePath: string,
		depth: number,
		visiting: Set<string>,
	): Promise<string> {
		if (depth > MAX_EMBED_DEPTH) {
			return markdown.replace(/!\[\[([^\]]+)\]\]/g, "*[Embed depth limit]*");
		}

		const found = findNextWikiEmbedOutsideFences(markdown);
		if (!found) return markdown;

		const { index, linkBody, fullLength } = found;
		const before = markdown.slice(0, index);
		const after = markdown.slice(index + fullLength);

		const replacement = await this.resolveOneWikiEmbed(
			linkBody,
			project,
			sourcePath,
			depth,
			visiting,
		);
		const combined = before + replacement + after;
		return this.expandNoteEmbeds(combined, project, sourcePath, depth, visiting);
	}

	private async resolveOneWikiEmbed(
		linkBody: string,
		project: ReportProject,
		sourcePath: string,
		depth: number,
		visiting: Set<string>,
	): Promise<string> {
		if (depth > MAX_EMBED_DEPTH) {
			return "*[Embed depth limit]*";
		}

		const parsed = parseEmbedLinkBody(linkBody);
		if (!parsed.path) {
			return "*[Invalid embed]*";
		}

		const file = this.app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath);
		if (!file) {
			return `*[Embed not found: ${parsed.path}]*`;
		}

		if (this.isImageFile(file)) {
			const src = encodeURI(file.path);
			const alt = file.basename;
			if (parsed.sizeSpec?.trim()) {
				return `![${alt}](${src} "${parsed.sizeSpec.trim()}")`;
			}
			return `![${alt}](${src})`;
		}

		if (file.extension !== "md") {
			return `*[Embed not supported (${file.extension}): ${parsed.path}]*`;
		}

		if (visiting.has(file.path)) {
			return `*[Circular embed: ${file.basename}]*`;
		}

		visiting.add(file.path);
		try {
			let body = await this.app.vault.read(file);
			if (!project.exportOptions.includeFrontmatter) {
				body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
			}

			if (parsed.blockId) {
				body = extractBlockById(body, parsed.blockId);
			} else if (parsed.headingRef) {
				body = extractHeadingSection(body, parsed.headingRef);
			}

			const trimmed = body.trim();
			return await this.expandNoteEmbeds(trimmed, project, file.path, depth + 1, visiting);
		} finally {
			visiting.delete(file.path);
		}
	}

	resolveNoteFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}
