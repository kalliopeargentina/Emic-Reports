import { ItemView, Notice, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { generatePreview } from "../../application/generate-preview";
import { updateProjectStructure } from "../../application/update-project-structure";
import type ReportArchitectPlugin from "../../main";
import type { ReportNode, ReportProject } from "../../domain/report-project";
import { validateProject } from "../../domain/report-project";
import { ReportNodeTree } from "../components/report-node-tree";
import { renderExportFormatSelector } from "../components/export-format-selector";
import { renderPageSizePicker } from "../components/page-size-picker";
import { CoverConfigModal } from "../modals/cover-config-modal";
import { ReportPreviewModal } from "../modals/report-preview-modal";
import { cloneJson } from "../../utils/json-clone";

export const REPORT_ARCHITECT_VIEW_TYPE = "report-architect-view";

export class ReportArchitectView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReportArchitectPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return REPORT_ARCHITECT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Report composer";
	}

	getIcon(): string {
		return "file-output";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		const project = await this.plugin.ensureActiveProject();

		container.createEl("h2", { text: project.name });
		const controls = container.createDiv({ cls: "ra-controls" });

		new Setting(controls)
			.setName("Project name")
			.addText((text) =>
				text.setValue(project.name).onChange((value) => {
					void (async () => {
						project.name = value.trim() || "Untitled report";
						project.updatedAt = new Date().toISOString();
						await this.plugin.projectRepository.save(project);
						await this.plugin.refreshProjectIndex();
					})();
				}),
			);

		const listedTemplates = await this.plugin.templateRepository.list();
		const hasTemplateOption = listedTemplates.some((t) => t.id === project.styleTemplateId);
		new Setting(controls)
			.setName("Style template")
			.setDesc("Pick a saved template. Edit templates in the style template editor side panel.")
			.addDropdown((dropdown) => {
				for (const t of listedTemplates) {
					dropdown.addOption(t.id, t.builtin ? `${t.name} (built-in)` : t.name);
				}
				if (!hasTemplateOption) {
					dropdown.addOption(
						project.styleTemplateId,
						`${project.styleTemplate.name || project.styleTemplateId} (current)`,
					);
				}
				dropdown.setValue(project.styleTemplateId);
				dropdown.onChange((id) => {
					void (async () => {
						const full = await this.plugin.templateRepository.loadFull(id);
						if (!full) {
							new Notice("Template not found.");
							return;
						}
						project.styleTemplateId = full.styleTemplate.id;
						project.styleTemplate = cloneJson(full.styleTemplate);
						project.backgroundImage = full.backgroundImage
							? { ...full.backgroundImage }
							: undefined;
						project.exportOptions.printBackground = Boolean(full.printBackground);
						project.updatedAt = new Date().toISOString();
						await this.plugin.projectRepository.save(project);
						await this.render();
					})();
				});
			});

		renderPageSizePicker(controls, project, (nextProject) => {
			void (async () => {
				await this.plugin.projectRepository.save({
					...nextProject,
					updatedAt: new Date().toISOString(),
				});
				await this.render();
			})();
		});

		renderExportFormatSelector(controls, project.exportOptions.formats, (next) => {
			void (async () => {
				project.exportOptions.formats = next;
				project.updatedAt = new Date().toISOString();
				await this.plugin.projectRepository.save(project);
			})();
		});

		new Setting(controls)
			.setName("Include frontmatter")
			.setDesc("Include YAML frontmatter fields in preview and exported documents.")
			.addToggle((toggle) =>
				toggle
					.setValue(Boolean(project.exportOptions.includeFrontmatter))
					.onChange((value) => {
						void (async () => {
							project.exportOptions.includeFrontmatter = value;
							project.updatedAt = new Date().toISOString();
							await this.plugin.projectRepository.save(project);
						})();
					}),
			);

		new Setting(controls)
			.setName("Enable cover page")
			.addToggle((toggle) =>
				toggle.setValue(project.coverEnabled).onChange((value) => {
					void (async () => {
						project.coverEnabled = value;
						project.updatedAt = new Date().toISOString();
						await this.plugin.projectRepository.save(project);
					})();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText("Edit cover").onClick(() => {
					new CoverConfigModal(this.app, { ...project.coverConfig }, async (updated) => {
						project.coverConfig = updated;
						project.coverConfigId = updated.id;
						project.updatedAt = new Date().toISOString();
						await this.plugin.projectRepository.save(project);
					}).open();
				}),
			);

		const nodePanel = container.createDiv({ cls: "ra-node-panel" });
		nodePanel.createEl("h3", { text: "Report structure" });
		new Setting(nodePanel).addButton((btn) =>
			btn.setButtonText("Add active note").setCta().onClick(async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!(activeFile instanceof TFile)) {
					new Notice("Open a note first.");
					return;
				}
				const nextNode: ReportNode = {
					id: globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}`,
					notePath: activeFile.path,
					titleOverride: activeFile.basename,
					order: project.nodes.length + 1,
					include: true,
					pageBreakBefore: false,
					pageBreakAfter: false,
					indentLevel: 0,
					headingOffset: 0,
					excludeFromToc: false,
					assetPolicy: "linked",
				};
				project.nodes.push(nextNode);
				project.updatedAt = new Date().toISOString();
				await this.plugin.projectRepository.save(project);
				await this.render();
			}),
		);

		const dropZone = nodePanel.createDiv({ cls: "ra-drop-zone" });
		dropZone.setText("Drag and drop Markdown notes here.");
		dropZone.addEventListener("dragover", (evt) => {
			evt.preventDefault();
			dropZone.addClass("is-drag-over");
		});
		dropZone.addEventListener("dragleave", () => {
			dropZone.removeClass("is-drag-over");
		});
		dropZone.addEventListener("drop", (evt) => {
			evt.preventDefault();
			dropZone.removeClass("is-drag-over");
			void this.handleDropAddNotes(evt, project);
		});

		const nodeTreeContainer = nodePanel.createDiv();
		const tree = new ReportNodeTree(nodeTreeContainer, project.nodes, (nextNodes) => {
			project.nodes = nextNodes;
			project.updatedAt = new Date().toISOString();
			void (async () => {
				const updated = await updateProjectStructure(this.plugin.projectRepository, project, nextNodes);
				project.nodes = updated.nodes;
				project.updatedAt = updated.updatedAt;
				await this.plugin.projectRepository.save(updated);
			})();
		});
		tree.render();

		const actionPanel = container.createDiv({ cls: "ra-action-panel" });
		new Setting(actionPanel)
			.addButton((btn) =>
				btn.setButtonText("Preview").setCta().onClick(async () => {
					const errors = validateProject(project);
					if (errors.length) {
						new Notice(errors[0] ?? "Project validation failed.");
						return;
					}
					const preview = await generatePreview(
						project,
						this.plugin.markdownComposer,
						this.plugin.linkResolver,
						this.plugin.htmlRenderer,
						this.plugin.cssTemplateEngine,
						this.plugin.assetResolver,
					);
					new ReportPreviewModal(this.app, project, preview.html).open();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText("Export").onClick(async () => {
					await this.plugin.exportProject(project);
				}),
			);
	}

	private async handleDropAddNotes(evt: DragEvent, project: ReportProject): Promise<void> {
		const dataTransfer = evt.dataTransfer;
		if (!dataTransfer) return;

		const droppedPaths = this.extractDroppedMarkdownPaths(dataTransfer);
		if (droppedPaths.length === 0) {
			new Notice("No Markdown notes detected in drop.");
			return;
		}

		const existing = new Set(project.nodes.map((node) => node.notePath));
		const uniquePaths = droppedPaths.filter((path) => !existing.has(path));
		if (uniquePaths.length === 0) {
			new Notice("All dropped notes are already in the report.");
			return;
		}

		let order = project.nodes.length;
		for (const notePath of uniquePaths) {
			const file = this.app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof TFile)) continue;
			order += 1;
			const nextNode: ReportNode = {
				id: globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${order}`,
				notePath: file.path,
				titleOverride: file.basename,
				order,
				include: true,
				pageBreakBefore: false,
				pageBreakAfter: false,
				indentLevel: 0,
				headingOffset: 0,
				excludeFromToc: false,
				assetPolicy: "linked",
			};
			project.nodes.push(nextNode);
		}

		project.updatedAt = new Date().toISOString();
		await this.plugin.projectRepository.save(project);
		new Notice(`Added ${uniquePaths.length} note(s) to report.`);
		await this.render();
	}

	private extractDroppedMarkdownPaths(dataTransfer: DataTransfer): string[] {
		const out = new Set<string>();
		const vaultBase = this.getVaultBasePath();

		for (const file of Array.from(dataTransfer.files)) {
			const fileAny = file as unknown as { path?: string };
			const absolute = fileAny.path;
			if (!absolute || !absolute.toLowerCase().endsWith(".md")) continue;
			const normalized = absolute.replace(/\\/g, "/");
			if (vaultBase && normalized.startsWith(vaultBase)) {
				const rel = normalized.slice(vaultBase.length + 1);
				out.add(rel);
			}
		}

		const text = dataTransfer.getData("text/plain");
		if (text) {
			for (const candidate of this.extractCandidatesFromText(text)) {
				const resolved = this.resolveCandidateToVaultPath(candidate, vaultBase);
				if (resolved) out.add(resolved);
			}
		}

		const html = dataTransfer.getData("text/html");
		if (html) {
			for (const candidate of this.extractCandidatesFromText(html)) {
				const resolved = this.resolveCandidateToVaultPath(candidate, vaultBase);
				if (resolved) out.add(resolved);
			}
		}

		const uriList = dataTransfer.getData("text/uri-list");
		if (uriList) {
			for (const candidate of this.extractCandidatesFromText(uriList)) {
				const resolved = this.resolveCandidateToVaultPath(candidate, vaultBase);
				if (resolved) out.add(resolved);
			}
		}

		for (const type of Array.from(dataTransfer.types)) {
			const payload = dataTransfer.getData(type);
			if (!payload) continue;
			for (const candidate of this.extractCandidatesFromText(payload)) {
				const resolved = this.resolveCandidateToVaultPath(candidate, vaultBase);
				if (resolved) out.add(resolved);
			}
		}

		return Array.from(out);
	}

	private extractCandidatesFromText(text: string): string[] {
		const out = new Set<string>();

		for (const token of text.split(/\r?\n/)) {
			const trimmed = token.trim();
			if (!trimmed) continue;
			out.add(trimmed);
		}

		const wikiMatches = text.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g);
		for (const match of wikiMatches) {
			const value = (match[1] ?? "").trim();
			if (value) out.add(value);
		}

		const markdownLinkMatches = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
		for (const match of markdownLinkMatches) {
			const value = (match[1] ?? "").trim();
			if (value) out.add(value);
		}

		const hrefMatches = text.matchAll(/(?:data-href|href)=["']([^"']+)["']/g);
		for (const match of hrefMatches) {
			const value = (match[1] ?? "").trim();
			if (value) out.add(value);
		}

		const mdPathMatches = text.matchAll(/([A-Za-z]:[\\/][^\r\n\t]+?\.md|[^'"<>\s]+\.(?:md))/gi);
		for (const match of mdPathMatches) {
			const value = (match[1] ?? "").trim();
			if (value) out.add(value);
		}

		return Array.from(out);
	}

	private resolveCandidateToVaultPath(candidateRaw: string, vaultBase: string | null): string | null {
		const candidate = candidateRaw
			.replace(/^file:\/\//i, "")
			.replace(/^obsidian:\/\//i, "")
			.replace(/\\/g, "/")
			.trim();
		if (!candidate) return null;

		const decoded = decodeURIComponent(candidate);
		const fromQuery = this.extractFileFromObsidianUri(decoded);
		const normalized = (fromQuery ?? decoded).replace(/^\/+/, "");

		if (normalized.toLowerCase().endsWith(".md")) {
			if (this.app.vault.getAbstractFileByPath(normalized)) return normalized;
			if (vaultBase && normalized.startsWith(vaultBase)) return normalized.slice(vaultBase.length + 1);
		}

		const resolved = this.app.metadataCache.getFirstLinkpathDest(normalized, "");
		if (resolved instanceof TFile && resolved.path.toLowerCase().endsWith(".md")) {
			return resolved.path;
		}

		return null;
	}

	private extractFileFromObsidianUri(value: string): string | null {
		const fileMatch = value.match(/[?&]file=([^&]+)/i);
		if (!fileMatch) return null;
		const fileValue = decodeURIComponent(fileMatch[1] ?? "").trim();
		return fileValue || null;
	}

	private getVaultBasePath(): string | null {
		const adapterAny = this.app.vault.adapter as unknown as { getBasePath?: () => string };
		if (typeof adapterAny.getBasePath !== "function") return null;
		return adapterAny.getBasePath().replace(/\\/g, "/");
	}
}
