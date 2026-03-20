/**
 * RGB triplets "r, g, b" for Obsidian built-in callout types (and aliases).
 * Used by PDF/CSS and DOCX so colors stay aligned.
 */
export const CALLOUT_TYPE_RGB: Record<string, string> = {
	note: "68, 138, 255",
	abstract: "0, 176, 255",
	summary: "0, 176, 255",
	tldr: "0, 176, 255",
	info: "0, 184, 212",
	todo: "68, 138, 255",
	tip: "0, 191, 165",
	hint: "0, 191, 165",
	important: "0, 191, 165",
	success: "0, 200, 83",
	check: "0, 200, 83",
	done: "0, 200, 83",
	question: "255, 193, 7",
	help: "255, 193, 7",
	faq: "255, 193, 7",
	warning: "255, 152, 0",
	caution: "255, 152, 0",
	attention: "255, 152, 0",
	failure: "244, 67, 54",
	fail: "244, 67, 54",
	missing: "244, 67, 54",
	danger: "255, 82, 82",
	error: "255, 82, 82",
	bug: "244, 67, 54",
	example: "124, 77, 255",
	quote: "158, 158, 158",
	cite: "158, 158, 158",
};
