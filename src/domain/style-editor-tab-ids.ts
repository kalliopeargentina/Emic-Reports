/** Must match tab `id` values in `renderAcademicStyleControls`. */
export const STYLE_EDITOR_TAB_IDS = [
	"page-print",
	"typography",
	"headings-credits",
	"links-tags",
	"code",
	"syntax-colors",
	"callouts",
	"blocks",
	"math-figures",
] as const;

export type StyleEditorTabId = (typeof STYLE_EDITOR_TAB_IDS)[number];

export const DEFAULT_STYLE_EDITOR_TAB_ID: StyleEditorTabId = "page-print";

export function isStyleEditorTabId(id: string): id is StyleEditorTabId {
	return (STYLE_EDITOR_TAB_IDS as readonly string[]).includes(id);
}
