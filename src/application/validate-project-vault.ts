import { TFile, TFolder, type App } from "obsidian";
import type { ReportProject, ReportNode } from "../domain/report-project";

function nodeKind(node: ReportNode): "note" | "folder" {
	return node.kind ?? "note";
}

/** Extra checks that require the vault (missing files/folders). */
export function validateProjectVault(project: ReportProject, app: App): string[] {
	const errors: string[] = [];
	for (const n of project.nodes) {
		if (!n.include) continue;
		if (nodeKind(n) === "note") {
			const p = n.notePath.trim();
			if (!p) continue;
			const f = app.vault.getAbstractFileByPath(p);
			if (!(f instanceof TFile)) {
				errors.push(`Note not found: ${p}`);
			}
		} else {
			const p = (n.folderPath ?? "").trim();
			if (!p) continue;
			const f = app.vault.getAbstractFileByPath(p);
			if (!(f instanceof TFolder)) {
				errors.push(`Folder not found: ${p}`);
			}
		}
	}
	return errors;
}
