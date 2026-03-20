import { TFile, type App } from "obsidian";
import type { ReportProject } from "../domain/report-project";

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

function slugifyObsidianHeading(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^\p{L}\p{N}\-]/gu, "");
}

function headingsMatch(title: string, ref: string): boolean {
	const t = title.trim();
	const r = ref.trim();
	if (t.localeCompare(r, undefined, { sensitivity: "accent" }) === 0) return true;
	if (slugifyObsidianHeading(t) === slugifyObsidianHeading(r)) return true;
	return false;
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

		if (line.trimStart().startsWith("```")) {
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

export class LinkResolver {
	constructor(private app: App) {}

	async resolve(_project: ReportProject, markdown: string): Promise<string> {
		const withEmbeds = await this.expandNoteEmbeds(markdown, _project, "", 0, new Set());

		const withWikiLinks = withEmbeds.replace(/\[\[([^\]]+)\]\]/g, (_full, linkBody: string) => {
			const [rawPath, alias] = linkBody.split("|");
			const normalizedPath = (rawPath ?? "").trim();
			const file = this.app.metadataCache.getFirstLinkpathDest(normalizedPath, "");
			if (!file) return alias ? alias.trim() : normalizedPath;
			const href = encodeURI(file.path);
			const label = alias?.trim() || file.basename;
			return `[${label}](${href})`;
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
