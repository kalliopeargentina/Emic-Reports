/**
 * Slug for `href="#..."` in export markdown and DOCX bookmarks.
 * Aligned with Obsidian / Reading view heading anchors (lowercase, hyphenated, no punctuation).
 */
export function slugifyHeadingForAnchor(title: string): string {
	let s = title
		.trim()
		.toLowerCase()
		.replace(/\p{Extended_Pictographic}/gu, "")
		.replace(/[\s_]+/g, "-")
		.replace(/[^\p{L}\p{N}\-]/gu, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (!s) s = "heading";
	return s;
}
