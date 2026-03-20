/**
 * Wait until the DOM subtree stops mutating (plugins finishing async renders)
 * or until maxMs. Used after MarkdownRenderer.render for Mermaid / chart blocks.
 */
export async function waitForDomStable(
	root: HTMLElement,
	opts: { stableMs?: number; maxMs?: number } = {},
): Promise<void> {
	const stableMs = opts.stableMs ?? 400;
	const maxMs = opts.maxMs ?? 20000;

	await new Promise<void>((resolve) => {
		let finished = false;
		let stableTimer = 0;

		const finish = () => {
			if (finished) return;
			finished = true;
			window.clearTimeout(stableTimer);
			window.clearTimeout(hardCap);
			observer.disconnect();
			resolve();
		};

		const bump = () => {
			window.clearTimeout(stableTimer);
			stableTimer = window.setTimeout(finish, stableMs);
		};

		const observer = new MutationObserver(() => bump());
		observer.observe(root, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		const hardCap = window.setTimeout(finish, maxMs);
		bump();
	});
}
