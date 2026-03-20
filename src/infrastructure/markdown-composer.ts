import { TFile, type App } from "obsidian";
import type { ReportProject, ReportNode } from "../domain/report-project";

export class MarkdownComposer {
	constructor(private app: App) {}
	private currentIncludeFrontmatter = false;

	async compose(project: ReportProject): Promise<string> {
		this.currentIncludeFrontmatter = Boolean(project.exportOptions.includeFrontmatter);
		const ordered = project.nodes
			.filter((node) => node.include)
			.sort((a, b) => a.order - b.order);

		const blocks = await Promise.all(ordered.map((node) => this.renderNodeBlock(node)));
		return blocks.filter(Boolean).join("\n\n");
	}

	private async renderNodeBlock(node: ReportNode): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(node.notePath);
		if (!(file instanceof TFile)) return "";

		const raw = await this.app.vault.read(file);
		const cleaned = this.shouldIncludeFrontmatter() ? raw : this.removeYamlFrontmatter(raw);
		const text = node.titleOverride?.trim()
			? this.removeLeadingDuplicateHeading(cleaned, node.titleOverride.trim())
			: cleaned;
		const lines: string[] = [];

		if (node.pageBreakBefore) lines.push("---");
		if (node.titleOverride?.trim()) lines.push(`# ${node.titleOverride.trim()}`);
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

	private shouldIncludeFrontmatter(): boolean {
		return this.currentIncludeFrontmatter;
	}

	private removeYamlFrontmatter(content: string): string {
		return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	}

	private removeLeadingDuplicateHeading(content: string, titleOverride: string): string {
		const headingMatch = content.match(/^\s*#\s+(.+)\r?\n?/);
		if (!headingMatch) return content;
		const firstHeading = (headingMatch[1] ?? "").trim();
		if (firstHeading.localeCompare(titleOverride, undefined, { sensitivity: "base" }) !== 0) {
			return content;
		}
		return content.replace(/^\s*#\s+.+\r?\n?/, "");
	}
}
