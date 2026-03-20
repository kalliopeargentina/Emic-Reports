import { TFile, type App } from "obsidian";
import type { ReportProject } from "../domain/report-project";

export class AssetResolver {
	constructor(private app: App) {}

	async resolveHtmlAssets(_project: ReportProject, html: string): Promise<string> {
		return html.replace(/src="([^"]+)"/g, (_full, src: string) => {
			if (src.startsWith("app://") || src.startsWith("http://") || src.startsWith("https://")) {
				return `src="${src}"`;
			}
			const clean = decodeURI(src);
			const file = this.app.vault.getAbstractFileByPath(clean);
			if (!(file instanceof TFile)) return `src="${src}"`;
			return `src="${this.app.vault.adapter.getResourcePath(file.path)}"`;
		});
	}
}
