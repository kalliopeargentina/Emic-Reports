import { TFile, type App } from "obsidian";
import type { ReportProject } from "../domain/report-project";

export class LinkResolver {
	constructor(private app: App) {}

	async resolve(_project: ReportProject, markdown: string): Promise<string> {
		const withWikiLinks = markdown.replace(/\[\[([^\]]+)\]\]/g, (_full, linkBody: string) => {
			const [rawPath, alias] = linkBody.split("|");
			const normalizedPath = (rawPath ?? "").trim();
			const file = this.app.metadataCache.getFirstLinkpathDest(normalizedPath, "");
			if (!file) return alias ? alias.trim() : normalizedPath;
			const href = encodeURI(file.path);
			const label = alias?.trim() || file.basename;
			return `[${label}](${href})`;
		});

		// Expand Obsidian image embed syntax into markdown image form.
		return withWikiLinks.replace(/!\[\[([^\]]+)\]\]/g, (_full, linkBody: string) => {
			const [rawPath, sizeRaw] = linkBody.split("|");
			const file = this.app.metadataCache.getFirstLinkpathDest((rawPath ?? "").trim(), "");
			if (!file) return "";
			const src = encodeURI(file.path);
			const alt = file.basename;
			if (sizeRaw?.trim()) {
				return `![${alt}](${src} "${sizeRaw.trim()}")`;
			}
			return `![${alt}](${src})`;
		});
	}

	resolveNoteFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}
