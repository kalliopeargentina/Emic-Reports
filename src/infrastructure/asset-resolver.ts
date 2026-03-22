import { TFile, type App } from "obsidian";
import { pathToFileURL } from "url";
import type { ReportProject } from "../domain/report-project";

/** How to rewrite `<img src="...">` for local vault files. */
export type AssetLinkTarget = "obsidian" | "fileExport";

const PRINT_IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"bmp",
	"svg",
]);

export class AssetResolver {
	constructor(private app: App) {}

	/**
	 * Rewrites local vault image paths so they load in the target context.
	 * - `obsidian`: `app://` resource URLs (HTML preview inside Obsidian).
	 * - `fileExport`: `file://` URLs for temp HTML opened by Chromium / Electron print-to-PDF.
	 */
	async resolveHtmlAssets(
		_project: ReportProject,
		html: string,
		target: AssetLinkTarget = "obsidian",
	): Promise<string> {
		const needAppLookup = target === "fileExport" && html.includes("app://");
		const appResourceMap = needAppLookup ? this.buildImageResourcePathMap() : null;

		return html.replace(/src="([^"]+)"/g, (_full, rawSrc: string) => {
			const src = rawSrc;
			if (src.startsWith("http://") || src.startsWith("https://")) {
				return `src="${src}"`;
			}
			if (src.startsWith("data:")) {
				return `src="${src}"`;
			}
			if (target === "obsidian" && src.startsWith("app://")) {
				return `src="${src}"`;
			}

			const file = this.resolveImgToVaultFile(src, appResourceMap);
			if (!(file instanceof TFile)) {
				return `src="${src}"`;
			}

			if (target === "fileExport") {
				const fileUrl = this.printableFileUrlForVaultFile(file);
				if (!fileUrl) {
					return `src="${src}"`;
				}
				return `src="${escapeHtmlAttr(fileUrl)}"`;
			}

			return `src="${this.app.vault.adapter.getResourcePath(file.path)}"`;
		});
	}

	private resolveImgToVaultFile(src: string, appMap: Map<string, TFile> | null): TFile | null {
		const noQuery = src.split("?")[0] ?? src;
		const clean = decodeURI(noQuery);
		const byPath = this.app.vault.getAbstractFileByPath(clean);
		if (byPath instanceof TFile) {
			return byPath;
		}
		if (appMap && src.startsWith("app://")) {
			return appMap.get(src) ?? null;
		}
		return null;
	}

	/** Map `getResourcePath(file.path)` → file (images only), for serialized HTML that uses `app://` src. */
	private buildImageResourcePathMap(): Map<string, TFile> {
		const m = new Map<string, TFile>();
		for (const f of this.app.vault.getFiles()) {
			if (!PRINT_IMAGE_EXTENSIONS.has(f.extension.toLowerCase())) {
				continue;
			}
			try {
				const rp = this.app.vault.adapter.getResourcePath(f.path);
				m.set(rp, f);
			} catch {
				/* skip */
			}
		}
		return m;
	}

	/**
	 * URL suitable for `<img src>` when loading print HTML from disk (file://).
	 * Prefer Obsidian's {@link FileSystemAdapter.getFilePath} when present.
	 */
	private printableFileUrlForVaultFile(file: TFile): string | null {
		const adapter = this.app.vault.adapter as unknown as {
			getFilePath?: (normalizedPath: string) => string;
			getFullPath?: (normalizedPath: string) => string;
		};
		if (typeof adapter.getFilePath === "function") {
			try {
				return adapter.getFilePath(file.path);
			} catch {
				return null;
			}
		}
		if (typeof adapter.getFullPath === "function") {
			try {
				return pathToFileURL(adapter.getFullPath(file.path)).href;
			} catch {
				return null;
			}
		}
		return null;
	}
}

function escapeHtmlAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
