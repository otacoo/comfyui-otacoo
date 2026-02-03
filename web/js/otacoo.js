/**
 * Otacoo: transforms ComfyUI combo list menu into a grid with preview images.
 */
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Inject extension CSS
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = new URL("../css/otacoo.css", import.meta.url).href;
document.head.appendChild(link);

const CHECKPOINT_LOADER = "OtacooCheckpointLoader";
const LORA_LOADER = "OtacooLoraLoader";

function getType(node) {
	if (node?.comfyClass === CHECKPOINT_LOADER) return "checkpoints";
	if (node?.comfyClass === LORA_LOADER) return "loras";
	return null;
}

function isModelWidget(widgetName, type) {
	if (type === "checkpoints") return widgetName === "ckpt_name";
	if (type === "loras") return /^lora_name_\d+$/.test(widgetName);
	return false;
}

let imagesByType = { checkpoints: {}, loras: {} };

async function loadImageList(type) {
	try {
		const r = await api.fetchApi(`/otacoo/images/${type}`);
		imagesByType[type] = await r.json();
	} catch (e) {
		imagesByType[type] = {};
	}
}

function positionMenu(menu, fillWidth) {
	let left = app.canvas?.last_mouse?.[0] ?? 0;
	let top = app.canvas?.last_mouse?.[1] ?? 0;
	const bodyRect = document.body.getBoundingClientRect();
	const menuRect = menu.getBoundingClientRect();
	if (bodyRect.width && left > bodyRect.width - menuRect.width - 10) {
		left = bodyRect.width - menuRect.width - 10;
	}
	if (bodyRect.height && top > bodyRect.height - menuRect.height - 10) {
		top = bodyRect.height - menuRect.height - 10;
	}
	menu.style.left = `${Math.max(10, left)}px`;
	menu.style.top = `${Math.max(10, top)}px`;
	if (fillWidth) {
		menu.style.maxWidth = "min(90vw, 720px)";
	}
}

function updateMenu(menu, type) {
	if (menu.classList.contains("otacoo-preview-grid")) return;

	const images = imagesByType[type] || {};
	const items = menu.querySelectorAll(".litemenu-entry");
	if (!items.length) return;

	menu.classList.add("otacoo-preview-grid");

	const rect = menu.getBoundingClientRect();
	const maxHeight = window.innerHeight - rect.top - 20;
	menu.style.maxHeight = `${Math.max(200, maxHeight)}px`;

	const origin = window.location.origin;
	items.forEach((item) => {
		const value = (item.getAttribute("data-value") || "").trim();
		const url = images[value];
		if (url) {
			const fullUrl = url.startsWith("http") ? url : origin + url;
			item.style.setProperty("--otacoo-bg-image", `url(${fullUrl})`);
		} else {
			item.style.removeProperty("--otacoo-bg-image");
		}
		item.classList.add("otacoo-preview-grid-entry");
	});

	positionMenu(menu, true);
}

app.registerExtension({
	name: "otacoo.previewGrid",
	async init() {
		await Promise.all([loadImageList("checkpoints"), loadImageList("loras")]);

		const refreshListInNodes = app.refreshComboInNodes;
		if (typeof refreshListInNodes === "function") {
			app.refreshComboInNodes = async function () {
				const r = await refreshListInNodes.apply(this, arguments);
				await loadImageList("checkpoints").catch(() => {});
				await loadImageList("loras").catch(() => {});
				return r;
			};
		}

		const mutationObserver = new MutationObserver((mutations) => {
			const node = app.canvas?.current_node;
			const type = getType(node);
			if (!type) return;

			for (const mutation of mutations) {
				for (const added of mutation.addedNodes) {
					if (!added?.classList?.contains?.("litecontextmenu")) continue;

					const overWidget =
						typeof app.canvas?.getWidgetAtCursor === "function"
							? app.canvas.getWidgetAtCursor()
							: null;
					const widgetName = overWidget?.name ?? "";
					if (!isModelWidget(widgetName, type)) return;
					if (!added.querySelector(".comfy-context-menu-filter")) return;

					requestAnimationFrame(() => {
						updateMenu(added, type);
					});
					return;
				}
			}
		});

		mutationObserver.observe(document.body, { childList: true, subtree: false });
	},
});
