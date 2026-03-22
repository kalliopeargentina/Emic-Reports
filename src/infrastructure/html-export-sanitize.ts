/**
 * Obsidian's Markdown preview adds UI around fenced code (e.g. copy). Export serializes DOM → PDF;
 * remove that chrome so print output matches a clean code block.
 */
function isLikelyCodeBlockWrapper(el: HTMLElement): boolean {
	const c = el.className?.toString() ?? "";
	return (
		/code-block|codeblock|HyperMD-codeblock|markdown-code|el-pre|cm-embed-block/i.test(c) ||
		(el.childElementCount <= 4 && el.querySelector(":scope > pre") !== null)
	);
}

export function stripCodeBlockChromeForExport(root: HTMLElement): void {
	root.querySelectorAll("pre button").forEach((b) => {
		(b as HTMLElement).remove();
	});

	for (const pre of Array.from(root.querySelectorAll("pre"))) {
		let el: HTMLElement | null = pre.parentElement;
		let foundWrapper: HTMLElement | null = null;
		for (let depth = 0; el && depth < 5; depth += 1, el = el.parentElement) {
			if (isLikelyCodeBlockWrapper(el)) {
				foundWrapper = el;
				break;
			}
		}
		if (foundWrapper) {
			foundWrapper.querySelectorAll("button").forEach((b) => {
				(b as HTMLElement).remove();
			});
		}

		const parent = pre.parentElement;
		if (parent) {
			parent.querySelectorAll(":scope > button").forEach((b) => {
				(b as HTMLElement).remove();
			});
		}

		const sib = pre.previousElementSibling;
		if (sib instanceof HTMLElement && sib.matches("button")) {
			sib.remove();
		}
	}
}
