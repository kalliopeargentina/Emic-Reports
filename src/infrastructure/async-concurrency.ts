/**
 * Limit how many async tasks run at once (e.g. MathJax + raster for DOCX export).
 * Tasks are FIFO; when one finishes, the next queued task starts.
 */
export function createAsyncConcurrencyLimiter(maxConcurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
	const limit = Math.max(1, Math.floor(maxConcurrency));
	let running = 0;
	const queue: Array<() => void> = [];

	const pump = (): void => {
		while (running < limit && queue.length > 0) {
			const start = queue.shift();
			if (start) start();
		}
	};

	return <T,>(fn: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			queue.push(() => {
				running++;
				void fn()
					.then(resolve, reject)
					.finally(() => {
						running--;
						pump();
					});
			});
			pump();
		});
}
