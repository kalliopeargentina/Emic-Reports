import { setIcon } from "obsidian";
import type { ReportNode } from "../../domain/report-project";

export class ReportNodeTree {
	private draggedNodeId: string | null = null;

	constructor(
		private container: HTMLElement,
		private nodes: ReportNode[],
		private onChange: (next: ReportNode[]) => void,
	) {}

	render(): void {
		this.container.empty();
		const list = this.container.createEl("div", { cls: "ra-node-list" });
		this.nodes
			.slice()
			.sort((a, b) => a.order - b.order)
			.forEach((node) => {
				const row = list.createDiv({ cls: "ra-node-row" });
				row.draggable = true;
				row.dataset.nodeId = node.id;

				const dragHandle = row.createSpan({ cls: "ra-node-handle" });
				setIcon(dragHandle, "grip-vertical");
				row.createSpan({ text: node.titleOverride || node.notePath, cls: "ra-node-title" });

				const includeToggle = row.createEl("input", { type: "checkbox" });
				includeToggle.checked = node.include;
				includeToggle.addEventListener("change", () => {
					node.include = includeToggle.checked;
					this.onChange(this.nodes);
				});

				const removeBtn = row.createEl("button", {
					cls: "ra-node-remove",
					attr: { type: "button", "aria-label": "Remove note" },
				});
				removeBtn.setText("×");
				removeBtn.setAttribute("title", "Remove note");
				removeBtn.addEventListener("click", () => {
					const remaining = this.nodes
						.filter((n) => n.id !== node.id)
						.sort((a, b) => a.order - b.order)
						.map((n, idx) => ({ ...n, order: idx + 1 }));
					this.nodes = remaining;
					this.onChange(remaining);
					this.render();
				});

				row.addEventListener("dragstart", () => {
					this.draggedNodeId = node.id;
					row.addClass("is-dragging");
				});
				row.addEventListener("dragover", (evt) => {
					evt.preventDefault();
					row.addClass("is-drag-over");
				});
				row.addEventListener("dragleave", () => row.removeClass("is-drag-over"));
				row.addEventListener("drop", (evt) => {
					evt.preventDefault();
					row.removeClass("is-drag-over");
					this.handleDrop(node.id);
				});
				row.addEventListener("dragend", () => {
					this.draggedNodeId = null;
					row.removeClass("is-dragging");
				});
			});
	}

	private handleDrop(targetId: string): void {
		if (!this.draggedNodeId || this.draggedNodeId === targetId) return;
		const ordered = this.nodes.slice().sort((a, b) => a.order - b.order);
		const sourceIndex = ordered.findIndex((n) => n.id === this.draggedNodeId);
		const targetIndex = ordered.findIndex((n) => n.id === targetId);
		if (sourceIndex < 0 || targetIndex < 0) return;
		const [moved] = ordered.splice(sourceIndex, 1);
		if (!moved) return;
		ordered.splice(targetIndex, 0, moved);
		ordered.forEach((n, idx) => {
			n.order = idx + 1;
		});
		this.nodes = ordered;
		this.onChange(ordered);
		this.render();
	}
}
