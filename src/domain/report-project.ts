import { createDefaultCoverConfig, type CoverConfig } from "./cover-config";
import { createDefaultExportProfile, type ExportProfile } from "./export-profile";
import {
	createAcademicExportTemplate,
	type BackgroundImageConfig,
	type StyleTemplate,
} from "./style-template";

export type ReportNodeKind = "note" | "folder";

export interface ReportNode {
	id: string;
	/** Defaults to `"note"` when missing (saved projects). */
	kind?: ReportNodeKind;
	/**
	 * For `note`: path to the Markdown file in the vault.
	 * For `folder`: leave empty; use `folderPath` instead.
	 */
	notePath: string;
	/** Required when `kind === "folder"` — vault path to the folder. */
	folderPath?: string;
	/**
	 * For folder nodes: ATX level of the root folder title (`1` = `#`, `2` = `##`, …).
	 * Subfolders use consecutive deeper levels. Default `1`.
	 */
	folderHeadingBase?: number;
	titleOverride?: string;
	order: number;
	include: boolean;
	pageBreakBefore: boolean;
	pageBreakAfter: boolean;
	indentLevel: number;
	headingOffset: number;
	excludeFromToc: boolean;
	assetPolicy: "inline" | "linked";
}

export interface ReportProject {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	paperSize: "A4" | "Letter" | "Legal" | "Custom";
	orientation: "portrait" | "landscape";
	customPageSize?: {
		width: number;
		height: number;
		unit: "mm" | "cm" | "in";
	};
	coverEnabled: boolean;
	coverConfigId?: string;
	coverConfig: CoverConfig;
	styleTemplateId: string;
	styleTemplate: StyleTemplate;
	backgroundImage?: BackgroundImageConfig;
	nodes: ReportNode[];
	exportOptions: ExportProfile;
}

function nodeKind(node: ReportNode): ReportNodeKind {
	return node.kind ?? "note";
}

/** Normalize nodes loaded from disk (older projects, hand-edited JSON). */
export function normalizeLoadedProject(project: ReportProject): ReportProject {
	return {
		...project,
		nodes: project.nodes.map((n) => {
			const kind = nodeKind(n);
			if (kind === "folder") {
				const fp = (n.folderPath ?? "").trim() || (n.notePath ?? "").trim();
				return {
					...n,
					kind: "folder" as const,
					folderPath: fp,
					notePath: "",
				};
			}
			return {
				...n,
				kind: "note" as const,
				notePath: n.notePath ?? "",
			};
		}),
	};
}

export function createEmptyProject(name: string): ReportProject {
	const now = new Date().toISOString();
	const id = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`;
	const template = createAcademicExportTemplate();
	const coverConfig = createDefaultCoverConfig();
	return {
		id,
		name,
		createdAt: now,
		updatedAt: now,
		paperSize: "A4",
		orientation: "portrait",
		coverEnabled: true,
		coverConfigId: coverConfig.id,
		coverConfig,
		styleTemplateId: template.id,
		styleTemplate: template,
		nodes: [],
		exportOptions: createDefaultExportProfile(),
	};
}

export function normalizeNodeOrder(nodes: ReportNode[]): ReportNode[] {
	return nodes
		.slice()
		.sort((a, b) => a.order - b.order)
		.map((node, idx) => ({ ...node, order: idx + 1 }));
}

export function validateProject(project: ReportProject): string[] {
	const errors: string[] = [];

	if (!project.name.trim()) errors.push("Project name is required.");
	for (const n of project.nodes) {
		if (nodeKind(n) === "note" && !n.notePath.trim()) {
			errors.push("Each note entry must have a file path.");
		}
		if (nodeKind(n) === "folder" && !(n.folderPath ?? "").trim()) {
			errors.push("Each folder entry must have a folder path.");
		}
	}
	if (project.coverEnabled && !project.coverConfig.title.trim()) {
		errors.push("Cover title is required when cover is enabled.");
	}
	if (project.paperSize === "Custom") {
		const custom = project.customPageSize;
		if (!custom || custom.width <= 0 || custom.height <= 0) {
			errors.push("Custom paper size must have valid width and height.");
		}
	}
	if (
		project.backgroundImage &&
		(project.backgroundImage.opacity < 0 || project.backgroundImage.opacity > 1)
	) {
		errors.push("Background opacity must be between 0 and 1.");
	}

	return errors;
}
