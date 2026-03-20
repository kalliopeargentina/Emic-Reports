import { Notice, Plugin } from "obsidian";
import { createProject } from "./application/create-project";
import { exportReportDocx } from "./application/export-report-docx";
import { exportReportPdf } from "./application/export-report-pdf";
import type { ReportProject } from "./domain/report-project";
import { AssetResolver } from "./infrastructure/asset-resolver";
import { CssTemplateEngine } from "./infrastructure/css-template-engine";
import { DocxExporter } from "./infrastructure/docx-exporter";
import { HtmlRenderer } from "./infrastructure/html-renderer";
import { LinkResolver } from "./infrastructure/link-resolver";
import { MarkdownComposer } from "./infrastructure/markdown-composer";
import { PdfExporterElectron } from "./infrastructure/pdf-exporter-electron";
import {
	VaultProjectRepository,
	type ProjectRepository,
} from "./infrastructure/project-repository";
import { ReportArchitectSettingTab, DEFAULT_SETTINGS, type ReportArchitectSettings } from "./settings";
import {
	REPORT_ARCHITECT_VIEW_TYPE,
	ReportArchitectView,
} from "./ui/views/report-architect-view";

export default class ReportArchitectPlugin extends Plugin {
	settings: ReportArchitectSettings;
	projectRepository: ProjectRepository;
	markdownComposer: MarkdownComposer;
	linkResolver: LinkResolver;
	htmlRenderer: HtmlRenderer;
	assetResolver: AssetResolver;
	cssTemplateEngine: CssTemplateEngine;
	pdfExporter: PdfExporterElectron;
	docxExporter: DocxExporter;
	private activeProjectId: string | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.projectRepository = new VaultProjectRepository(this.app);
		this.markdownComposer = new MarkdownComposer(this.app);
		this.linkResolver = new LinkResolver(this.app);
		this.htmlRenderer = new HtmlRenderer(this.app, this);
		this.assetResolver = new AssetResolver(this.app);
		this.cssTemplateEngine = new CssTemplateEngine();
		this.pdfExporter = new PdfExporterElectron(this.app);
		this.docxExporter = new DocxExporter(this.app);

		this.registerView(
			REPORT_ARCHITECT_VIEW_TYPE,
			(leaf) => new ReportArchitectView(leaf, this),
		);

		this.addRibbonIcon("file-output", "Open emic report architect", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-report-architect",
			name: "Open workspace view",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "export-active-report-project",
			name: "Export active report project",
			callback: async () => {
				const project = await this.ensureActiveProject();
				await this.exportProject(project);
			},
		});

		this.addSettingTab(new ReportArchitectSettingTab(this.app, this));
	}

	onunload(): void {
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ReportArchitectSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async ensureActiveProject(): Promise<ReportProject> {
		if (this.activeProjectId) {
			const project = await this.projectRepository.getById(this.activeProjectId);
			if (project) return project;
		}
		const all = await this.projectRepository.list();
		if (all.length > 0) {
			const first = all[0];
			if (!first) {
				throw new Error("Failed to read project list.");
			}
			this.activeProjectId = first.id;
			return first;
		}

		const created = await createProject(this.projectRepository, "Report project");
		this.activeProjectId = created.id;
		await this.refreshProjectIndex();
		return created;
	}

	async refreshProjectIndex(): Promise<void> {
		const all = await this.projectRepository.list();
		this.settings.projectsIndex = all.map((project) => ({
			id: project.id,
			name: project.name,
			updatedAt: project.updatedAt,
		}));
		await this.saveSettings();
	}

	async exportProject(project: ReportProject): Promise<void> {
		const folder = this.settings.defaultOutputFolder.trim() || "Emic report architect";
		await this.ensureVaultFolder(folder);
		const safeName = project.name.replace(/[\\/:*?"<>|]/g, "-");

		if (project.exportOptions.formats === "pdf" || project.exportOptions.formats === "both") {
			const pdfPath = `${folder}/${safeName}.pdf`;
			await exportReportPdf(
				project,
				pdfPath,
				this.pdfExporter,
				this.markdownComposer,
				this.linkResolver,
				this.htmlRenderer,
				this.cssTemplateEngine,
				this.assetResolver,
			);
			new Notice(`PDF export ready: ${pdfPath}`);
		}

		if (project.exportOptions.formats === "docx" || project.exportOptions.formats === "both") {
			const docxPath = `${folder}/${safeName}.docx`;
			await exportReportDocx(
				project,
				docxPath,
				this.docxExporter,
				this.markdownComposer,
				this.linkResolver,
			);
			new Notice(`DOCX export ready: ${docxPath}`);
		}
	}

	private async ensureVaultFolder(path: string): Promise<void> {
		const parts = path.split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(REPORT_ARCHITECT_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) {
				new Notice("Unable to open emic report architect view.");
				return;
			}
			await leaf.setViewState({
				type: REPORT_ARCHITECT_VIEW_TYPE,
				active: true,
			});
		}
		void workspace.revealLeaf(leaf);
	}
}
