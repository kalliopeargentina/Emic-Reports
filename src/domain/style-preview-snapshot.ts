import type { StyleEditorState } from "./style-editor-state";
import type { StyleEditorTabId } from "./style-editor-tab-ids";

/** Implemented by the style template editor view so the style preview can read the live draft. */
export interface StylePreviewSnapshotSource {
	getStylePreviewSnapshot(): {
		activeStyleTabId: StyleEditorTabId;
		state: StyleEditorState;
	} | null;
}
