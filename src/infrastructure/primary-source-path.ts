import { TFile, TFolder, type App } from "obsidian";
import type { ReportProject, ReportNode } from "../domain/report-project";

function nodeKind(node: ReportNode): "note" | "folder" {
	return node.kind ?? "note";
}

export function collectMarkdownFilesInFolder(folder: TFolder): TFile[] {
	const out: TFile[] = [];
	const walk = (f: TFile | TFolder): void => {
		if (f instanceof TFolder) {
			for (const c of f.children) {
				walk(c as TFile | TFolder);
			}
		} else if (f instanceof TFile && f.extension === "md") {
			out.push(f);
		}
	};
	walk(folder);
	out.sort((a, b) => a.path.localeCompare(b.path));
	return out;
}

export function getFirstMarkdownPathInFolder(app: App, folderPath: string): string {
	const abs = app.vault.getAbstractFileByPath(folderPath);
	if (!(abs instanceof TFolder)) return "";
	const files = collectMarkdownFilesInFolder(abs);
	return files[0]?.path ?? "";
}

/**
 * First included Markdown file path — used as `sourcePath` for MarkdownRenderer and link resolution.
 */
export function getPrimaryMarkdownSourcePath(project: ReportProject, app: App): string {
	const ordered = project.nodes
		.filter((n) => n.include)
		.sort((a, b) => a.order - b.order);
	for (const n of ordered) {
		if (nodeKind(n) === "note" && n.notePath.trim()) {
			return n.notePath;
		}
		if (nodeKind(n) === "folder" && n.folderPath?.trim()) {
			const first = getFirstMarkdownPathInFolder(app, n.folderPath.trim());
			if (first) return first;
		}
	}
	for (const n of ordered) {
		if (nodeKind(n) === "folder" && n.folderPath?.trim()) {
			return n.folderPath.trim();
		}
	}
	return "";
}
