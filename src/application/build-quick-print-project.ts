import type { TFile } from "obsidian";
import { createEmptyProject, type ReportProject } from "../domain/report-project";
import type { TemplateRepository } from "../infrastructure/template-repository";
import { cloneJson } from "../utils/json-clone";
import type { ReportArchitectSettings } from "../settings";

async function resolveQuickPrintTemplateId(
	settings: ReportArchitectSettings,
	templateRepository: TemplateRepository,
): Promise<string> {
	const preferred = settings.quickPrintTemplateId?.trim();
	if (preferred) {
		const full = await templateRepository.loadFull(preferred);
		if (full) return preferred;
	}
	const listed = await templateRepository.list();
	return listed[0]?.id ?? "";
}

/**
 * One-off report: single active note, no cover, export formats from settings default, style from quick-print template.
 */
export async function buildQuickPrintProjectForNote(
	file: TFile,
	settings: ReportArchitectSettings,
	templateRepository: TemplateRepository,
): Promise<ReportProject | null> {
	const templateId = await resolveQuickPrintTemplateId(settings, templateRepository);
	if (!templateId) return null;

	const full = await templateRepository.loadFull(templateId);
	if (!full) return null;

	const project = createEmptyProject(file.basename);
	project.paperSize = settings.defaultPaperSize;
	project.coverEnabled = false;
	project.styleTemplateId = full.styleTemplate.id;
	project.styleTemplate = cloneJson(full.styleTemplate);
	project.backgroundImage = full.backgroundImage ? { ...full.backgroundImage } : undefined;
	project.exportOptions = {
		...project.exportOptions,
		formats: settings.defaultFormat,
		printBackground: Boolean(full.printBackground),
		paperSize: settings.defaultPaperSize,
	};

	project.nodes = [
		{
			id: globalThis.crypto?.randomUUID?.() ?? `quick-${Date.now()}`,
			kind: "note",
			notePath: file.path,
			order: 1,
			include: true,
			pageBreakBefore: false,
			pageBreakAfter: false,
			indentLevel: 0,
			headingOffset: 0,
			excludeFromToc: false,
			assetPolicy: "linked",
		},
	];

	return project;
}
