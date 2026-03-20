import { Notice, type App } from "obsidian";
import { execFile } from "child_process";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type { ReportProject } from "../domain/report-project";
import { mergeStyleTokens } from "../domain/style-template";
import { paginateHtml } from "./html-paginator";
import { PageSizeResolver } from "./page-size-resolver";

export interface HtmlPreviewBundle {
	html: string;
	css: string;
}

export class PdfExporterElectron {
	private pageSizeResolver = new PageSizeResolver();
	private execFileAsync = promisify(execFile);

	constructor(private app: App) {}

	async export(project: ReportProject, bundle: HtmlPreviewBundle, outputPath: string): Promise<void> {
		const htmlPath = await this.writeTemporaryHtml(project, bundle);
		const generated = await this.tryHeadlessBrowserPdf(htmlPath, outputPath);

		if (generated) {
			return;
		}

		const buffer = await this.tryElectronPrintToPdf(htmlPath, project);
		if (buffer) {
			const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
			await this.app.vault.adapter.writeBinary(outputPath, arrayBuffer);
			return;
		}

		new Notice("Automatic export unavailable. A preview HTML was generated for manual print.");
	}

	private async writeTemporaryHtml(project: ReportProject, bundle: HtmlPreviewBundle): Promise<string> {
		const pluginRoot = `${this.app.vault.configDir}/plugins/emic-reports`;
		const dataRoot = `${pluginRoot}/data`;
		const tempDir = `${dataRoot}/tmp`;
		if (!(await this.app.vault.adapter.exists(pluginRoot))) {
			await this.app.vault.adapter.mkdir(pluginRoot);
		}
		if (!(await this.app.vault.adapter.exists(dataRoot))) {
			await this.app.vault.adapter.mkdir(dataRoot);
		}
		if (!(await this.app.vault.adapter.exists(tempDir))) {
			await this.app.vault.adapter.mkdir(tempDir);
		}

		const page = this.pageSizeResolver.resolve(project);
		const pages = paginateHtml(project, bundle.html);
		const t = mergeStyleTokens(project.styleTemplate.tokens);
		const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<style>${bundle.css}</style>
<style>
html, body { margin: 0; background: ${t.pageBackgroundColor} !important; }
.ra-print-sheet {
	width: ${page.width};
	height: ${page.height};
	margin: 0 auto;
	page-break-after: always;
	box-sizing: border-box;
	background: ${t.pageBackgroundColor};
}
.ra-export-page-body {
	height: 100%;
	overflow: hidden;
	box-sizing: border-box;
	padding-top: ${t.pageMarginTop};
	padding-right: ${t.pageMarginRight};
	padding-bottom: ${t.pageMarginBottom};
	padding-left: ${t.pageMarginLeft};
}
</style>
<script>
async function waitForAssets() {
	const images = Array.from(document.images || []);
	await Promise.all(images.map((img) => {
		if (img.complete) return Promise.resolve();
		return new Promise((resolve) => {
			img.addEventListener("load", resolve, { once: true });
			img.addEventListener("error", resolve, { once: true });
		});
	}));
	if (document.fonts && document.fonts.ready) {
		try { await document.fonts.ready; } catch {}
	}
	document.body.setAttribute("data-ra-ready", "1");
}
window.addEventListener("load", () => { void waitForAssets(); });
</script>
</head>
<body>
${pages
	.map(
		(pageHtml) => `<div class="ra-print-sheet">
<div class="ra-render-frame ra-export-page-body">${pageHtml}</div>
</div>`,
	)
	.join("\n")}
</body>
</html>`;
		const htmlPath = `${tempDir}/${project.id}.html`;
		await this.app.vault.adapter.write(htmlPath, html);
		return htmlPath;
	}

	private async tryElectronPrintToPdf(
		htmlPath: string,
		project: ReportProject,
	): Promise<Uint8Array | null> {
		try {
			const winAny = window as unknown as {
				require?: (mod: string) => {
					BrowserWindow?: {
						getFocusedWindow?: () => {
							webContents?: {
								loadURL?: (url: string) => Promise<void>;
								printToPDF?: (options: Record<string, unknown>) => Promise<Uint8Array>;
							};
						};
					};
				};
			};
			if (!winAny.require) return null;
			const electron = winAny.require("electron");
			const focusedWindow = electron.BrowserWindow?.getFocusedWindow?.();
			if (!focusedWindow?.webContents?.loadURL || !focusedWindow.webContents.printToPDF) return null;

			const fullPath = this.adapterPathToFileUrl(htmlPath);
			await focusedWindow.webContents.loadURL(fullPath);
			return await focusedWindow.webContents.printToPDF({
				printBackground: project.exportOptions.printBackground,
				landscape: project.orientation === "landscape",
				pageSize: project.paperSize === "Custom" ? "A4" : project.paperSize,
				margins: {
					marginType: "none",
				},
			});
		} catch {
			return null;
		}
	}

	private async tryHeadlessBrowserPdf(htmlPath: string, outputPath: string): Promise<boolean> {
		const binary = this.resolveBrowserBinary();
		const basePath = this.getVaultBasePath();
		if (!binary || !basePath) {
			return false;
		}

		const outputAbsolute = path.resolve(basePath, outputPath);
		const outputDir = path.dirname(outputAbsolute);
		await this.ensureDirectory(outputDir);

		const htmlAbsolute = path.resolve(basePath, htmlPath);
		const htmlUrl = this.adapterPathToFileUrl(htmlAbsolute);

		try {
			await this.execFileAsync(binary, [
				"--headless",
				"--disable-gpu",
				"--disable-print-preview",
				"--no-first-run",
				"--no-default-browser-check",
				"--allow-file-access-from-files",
				"--no-pdf-header-footer",
				"--virtual-time-budget=20000",
				`--print-to-pdf=${outputAbsolute}`,
				"--print-to-pdf-no-header",
				htmlUrl,
			]);
			return existsSync(outputAbsolute);
		} catch {
			return false;
		}
	}

	private resolveBrowserBinary(): string | null {
		const candidates = [
			"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
			"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
			"C:/Program Files/Google/Chrome/Application/chrome.exe",
			"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
		return null;
	}

	private getVaultBasePath(): string | null {
		const adapterAny = this.app.vault.adapter as unknown as {
			getBasePath?: () => string;
		};
		if (typeof adapterAny.getBasePath !== "function") {
			return null;
		}
		return adapterAny.getBasePath();
	}

	private async ensureDirectory(absolutePath: string): Promise<void> {
		await mkdir(absolutePath, { recursive: true });
	}

	private adapterPathToFileUrl(path: string): string {
		const normalized = path.replace(/\\/g, "/");
		if (normalized.startsWith("/")) return `file://${normalized}`;
		return `file:///${normalized}`;
	}
}
