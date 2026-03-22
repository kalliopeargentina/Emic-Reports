import { createEmptyProject, type ReportProject } from "../domain/report-project";
import type { StyleEditorState } from "../domain/style-editor-state";
import { cloneJson } from "../utils/json-clone";

/** Minimal project for isolated export-style preview (no cover, no notes). */
export function buildStylePreviewProject(state: StyleEditorState): ReportProject {
	const base = createEmptyProject("Style preview");
	base.coverEnabled = false;
	base.styleTemplate = cloneJson(state.styleTemplate);
	if (state.backgroundImage) {
		base.backgroundImage = { ...state.backgroundImage };
	} else {
		delete base.backgroundImage;
	}
	base.nodes = [];
	return base;
}
