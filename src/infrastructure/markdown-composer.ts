import { TFile, TFolder, type App } from "obsidian";
import type { ReportProject, ReportNode } from "../domain/report-project";
import {
	deepestSyntheticFolderHeadingLevel,
	shiftMarkdownAtxHeadings,
} from "./markdown-atx-heading-shift";
import { collectMarkdownFilesInFolder } from "./primary-source-path";

function normVaultPath(p: string): string {
	return p.replace(/\\/g, "/");
}

function relativePathUnderFolder(folderPath: string, filePath: string): string {
	const f = normVaultPath(folderPath).replace(/\/$/, "");
	const p = normVaultPath(filePath);
	const prefix = `${f}/`;
	if (!p.startsWith(prefix)) return p;
	return p.slice(prefix.length);
}

function nodeKind(node: ReportNode): "note" | "folder" {
	return node.kind ?? "note";
}

/** Thematic break between sources; styled as a page break in print/PDF when template enables it. */
const SOURCE_PAGE_BREAK = "\n\n---\n\n";

export class MarkdownComposer {
	constructor(private app: App) {}
	private currentIncludeFrontmatter = false;

	async compose(project: ReportProject): Promise<string> {
		this.currentIncludeFrontmatter = Boolean(project.exportOptions.includeFrontmatter);
		const ordered = project.nodes
			.filter((node) => node.include)
			.sort((a, b) => a.order - b.order);

		const blocks = await Promise.all(ordered.map((node) => this.renderNodeBlock(node)));
		return blocks.filter(Boolean).join(SOURCE_PAGE_BREAK);
	}

	private async renderNodeBlock(node: ReportNode): Promise<string> {
		if (nodeKind(node) === "folder") {
			return this.renderFolderNode(node);
		}
		return this.renderNoteNode(node);
	}

	private async renderNoteNode(node: ReportNode): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(node.notePath);
		if (!(file instanceof TFile)) return "";

		const raw = await this.app.vault.read(file);
		const cleaned = this.shouldIncludeFrontmatter() ? raw : this.removeYamlFrontmatter(raw);
		const text = cleaned;
		const lines: string[] = [];

		if (node.pageBreakBefore) lines.push("---");
		if (node.indentLevel > 0) {
			const prefix = " ".repeat(node.indentLevel * 2);
			lines.push(
				text
					.split("\n")
					.map((line) => (line.trim() ? `${prefix}${line}` : line))
					.join("\n"),
			);
		} else {
			lines.push(text);
		}
		if (node.pageBreakAfter) lines.push("---");

		return lines.join("\n");
	}

	private async renderFolderNode(node: ReportNode): Promise<string> {
		const fp = (node.folderPath ?? "").trim();
		if (!fp) return "";

		const folder = this.app.vault.getAbstractFileByPath(fp);
		if (!(folder instanceof TFolder)) return "";

		const base = Math.min(6, Math.max(1, node.folderHeadingBase ?? 1));
		const rootTitle = node.titleOverride?.trim() || folder.name;
		const files = collectMarkdownFilesInFolder(folder);
		if (files.length === 0) return "";

		const chunks: string[] = [];
		if (node.pageBreakBefore) chunks.push("---");

		let prevHierarchy: string[] = [];

		for (const file of files) {
			const rel = relativePathUnderFolder(fp, file.path);
			const dirPart = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
			const segments = dirPart ? dirPart.split("/").filter(Boolean) : [];
			const hierarchy = [rootTitle, ...segments];

			const headingLines: string[] = [];
			let i = 0;
			while (i < prevHierarchy.length && i < hierarchy.length && prevHierarchy[i] === hierarchy[i]) {
				i += 1;
			}
			for (let j = i; j < hierarchy.length; j += 1) {
				const level = Math.min(6, base + j);
				const title = hierarchy[j];
				if (title) {
					headingLines.push(`${"#".repeat(level)} ${title}`);
				}
			}
			prevHierarchy = hierarchy;

			const raw = await this.app.vault.read(file);
			const cleaned = this.shouldIncludeFrontmatter() ? raw : this.removeYamlFrontmatter(raw);
			const depthUnderFolder = deepestSyntheticFolderHeadingLevel(base, hierarchy.length);
			let body = shiftMarkdownAtxHeadings(cleaned, depthUnderFolder);
			if (node.indentLevel > 0) {
				const prefix = " ".repeat(node.indentLevel * 2);
				body = body
					.split("\n")
					.map((line) => (line.trim() ? `${prefix}${line}` : line))
					.join("\n");
			}

			const block = [...headingLines, body].filter(Boolean).join("\n\n");
			chunks.push(block);
		}

		if (node.pageBreakAfter) chunks.push("---");
		return chunks.join(SOURCE_PAGE_BREAK);
	}

	private shouldIncludeFrontmatter(): boolean {
		return this.currentIncludeFrontmatter;
	}

	private removeYamlFrontmatter(content: string): string {
		return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	}
}
