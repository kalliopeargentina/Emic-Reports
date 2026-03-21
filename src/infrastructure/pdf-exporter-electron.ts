import { Notice, type App } from "obsidian";
import { execFile } from "child_process";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";
import type { ReportProject } from "../domain/report-project";
import { resolveChromiumBinary } from "./chromium-resolve";
import { buildPrintableHtmlDocument, type HtmlPreviewBundle } from "./pdf-print-html";

export type { HtmlPreviewBundle };

export class PdfExporterElectron {
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

		const html = buildPrintableHtmlDocument(project, bundle);
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
								executeJavaScript?: (code: string) => Promise<unknown>;
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
			const exec = focusedWindow.webContents.executeJavaScript;
			if (typeof exec === "function") {
				await exec(`
					new Promise((resolve) => {
						const deadline = Date.now() + 20000;
						const tick = () => {
							if (document.body && document.body.getAttribute("data-ra-ready") === "1") {
								resolve(true);
								return;
							}
							if (Date.now() > deadline) {
								resolve(false);
								return;
							}
							requestAnimationFrame(tick);
						};
						tick();
					});
				`);
			}
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
		const binary = resolveChromiumBinary();
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
