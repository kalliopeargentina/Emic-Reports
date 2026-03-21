import { defineConfig } from "vitest/config";

/** happy-dom: DOMParser for html-paginator.flattenPaginableNodes tests (see file-level env). */
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
