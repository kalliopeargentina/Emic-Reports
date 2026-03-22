/**
 * Increase depth of ATX headings (`#` … `######`) so note outlines nest under injected folder headings.
 * Ignores headings inside fenced code blocks (``` / ~~~).
 */
export function shiftMarkdownAtxHeadings(markdown: string, addLevels: number): string {
	if (addLevels <= 0) return markdown;

	const lines = markdown.split(/\r?\n/);
	const out: string[] = [];
	let inFence = false;

	for (const line of lines) {
		const fenceMatch = line.match(/^\s*(```+|~~~+)/);
		if (fenceMatch) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}

		const hm = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
		if (hm) {
			const indent = hm[1] ?? "";
			const oldCount = hm[2]!.length;
			const sp = hm[3] ?? " ";
			const tail = hm[4] ?? "";
			const newCount = Math.min(6, oldCount + addLevels);
			out.push(`${indent}${"#".repeat(newCount)}${sp}${tail}`);
		} else {
			out.push(line);
		}
	}

	return out.join("\n");
}

/**
 * Level of the deepest synthetic folder heading for this file (1–6).
 * `base` is the ATX level of the root folder title; `hierarchy` includes root + each path segment.
 */
export function deepestSyntheticFolderHeadingLevel(base: number, hierarchyLength: number): number {
	if (hierarchyLength < 1) return base;
	return Math.min(6, base + hierarchyLength - 1);
}
