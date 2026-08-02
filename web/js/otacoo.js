/**
 * Transforms ComfyUI combo list menu into a grid with preview images.
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
const UNET_LOADER = "OtacooUnetLoader";

const WIDGET_PATTERNS = {
	checkpoints: { type: "checkpoints", pattern: (w) => w === "ckpt_name" },
	loras: { type: "loras", pattern: (w) => /^lora_name_\d+$/.test(w) },
	unet: { type: "unet", pattern: (w) => w === "unet_name" },
};

function getType(node) {
	if (node?.comfyClass === CHECKPOINT_LOADER) return "checkpoints";
	if (node?.comfyClass === LORA_LOADER) return "loras";
	if (node?.comfyClass === UNET_LOADER) return "unet";
	return null;
}

function isModelWidget(widgetName, type) {
	return WIDGET_PATTERNS[type]?.pattern(widgetName) ?? false;
}

function isVueNodesMode() {
	return !!(globalThis.LiteGraph && globalThis.LiteGraph.vueNodesMode);
}

function hideWidget(widget) {
	if (!widget) return;
	widget.hidden = true;
	widget.visible = false;
	// options.hidden is only consumed by the Vue (Nodes 2.0) renderer
	if (widget.options) widget.options.hidden = true;
}

let activeModelPickerMenu = null;

function closeModelPickerMenu() {
	if (activeModelPickerMenu) {
		activeModelPickerMenu.remove();
		activeModelPickerMenu = null;
	}
}

document.addEventListener(
	"pointerdown",
	(e) => {
		if (activeModelPickerMenu && !activeModelPickerMenu.contains(e.target)) closeModelPickerMenu();
	},
	true
);

let imagesByType = { checkpoints: {}, loras: {}, unet: {} };
let loraNamesCache = null;

async function getLoraNames() {
	if (Array.isArray(loraNamesCache)) return loraNamesCache;
	try {
		const r = await api.fetchApi("/otacoo/loras/names");
		loraNamesCache = await r.json();
	} catch (_) {
		loraNamesCache = ["None"];
	}
	return loraNamesCache;
}

async function loadImageList(type) {
	try {
		const r = await api.fetchApi(`/otacoo/images/${type}`);
		imagesByType[type] = await r.json();
	} catch (e) {
		imagesByType[type] = {};
	}
}

function positionMenu(menu) {
	const [left, top] = app.canvas?.last_mouse ?? [0, 0];
	const body = document.body.getBoundingClientRect();
	const rect = menu.getBoundingClientRect();
	const x = Math.max(10, body.width && left > body.width - rect.width - 10 ? body.width - rect.width - 10 : left);
	const y = Math.max(10, body.height && top > body.height - rect.height - 10 ? body.height - rect.height - 10 : top);
	menu.style.left = `${x}px`;
	menu.style.top = `${y}px`;
}

function updateMenu(menu, type) {
	const items = menu.querySelectorAll(".litemenu-entry");
	if (!items.length) return;

	if (menu.querySelector(".litemenu-title") || menu.querySelector(".has_submenu")) return;
	
	// Failsafe for context menus that don't have titles but have typical node actions
	const firstItemText = (items[0].textContent || "").trim();
	if (firstItemText.includes("Add GetNode") || firstItemText.includes("Rename Widget") || firstItemText === "Properties") return;

	if (menu.classList.contains("otacoo-preview-grid") && items[0].classList.contains("otacoo-preview-grid-entry")) return;

	menu.classList.add("otacoo-preview-grid");

	const listContainer = items[0].parentElement;
	if (listContainer) listContainer.classList.add("otacoo-grid-list");

	// Add filter if missing, otherwise update placeholder
	let filterWrap = menu.querySelector(".comfy-context-menu-filter");
	let filterInput = filterWrap ? filterWrap.querySelector("input") : null;
	if (!filterWrap) {
		filterWrap = document.createElement("div");
		filterWrap.className = "comfy-context-menu-filter";
		filterInput = document.createElement("input");
		filterInput.type = "text";
		filterWrap.appendChild(filterInput);
		menu.insertBefore(filterWrap, menu.firstChild);

		filterInput.addEventListener("input", () => {
			const q = filterInput.value.toLowerCase();
			items.forEach((item) => {
				const value = (item.getAttribute("data-value") || item.textContent || "").toLowerCase();
				item.style.display = value.includes(q) ? "" : "none";
			});
		});

		filterInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				const visible = Array.from(items).filter(el => el.style.display !== "none");
				if (visible.length === 1) visible[0].click();
			} else if (e.key === "Escape") {
				menu.remove();
			}
		});
		
		// Focus after adding (timeout helps if it was just injected)
		setTimeout(() => filterInput.focus(), 10);
	}
	if (filterInput) filterInput.placeholder = "Filter...";

	const rect = menu.getBoundingClientRect();
	menu.style.maxHeight = `${Math.max(200, window.innerHeight - rect.top - 20)}px`;

	const images = imagesByType[type] || {};
	const origin = window.location.origin;
	for (const item of items) {
		const value = (item.getAttribute("data-value") || "").trim();
		const url = images[value];
		if (url) item.style.setProperty("--otacoo-bg-image", `url(${url.startsWith("http") ? url : origin + url})`);
		else item.style.removeProperty("--otacoo-bg-image");
		item.classList.add("otacoo-preview-grid-entry");
	}

	positionMenu(menu);
}

/** Applies the Vue-mode model pickers to any existing loader nodes missing them. */
function ensureVueModelPickers() {
	if (!isVueNodesMode()) return;
	for (const node of app.graph?._nodes ?? []) {
		if (node.comfyClass === CHECKPOINT_LOADER) addModelPickerWidget(node, "ckpt_name", "checkpoints");
		else if (node.comfyClass === UNET_LOADER) addModelPickerWidget(node, "unet_name", "unet");
	}
}

/** Removes the Vue-mode picker and restores the native combo widget. */
function restoreModelPicker(node, comboName, type) {
	const picker = node.widgets.find((w) => w.name === `otacoo_model_picker_${type}`);
	if (picker) {
		const idx = node.widgets.indexOf(picker);
		if (idx >= 0) node.widgets.splice(idx, 1);
	}
	const comboWidget = node.widgets.find((w) => w.name === comboName);
	if (comboWidget) {
		comboWidget.hidden = false;
		comboWidget.visible = true;
		if (comboWidget.options) delete comboWidget.options.hidden;
	}
	node.setDirtyCanvas?.(true, true);
}

/** Reverts loader nodes to their native combos (used when Vue mode is disabled). */
function restoreVueModelPickers() {
	if (isVueNodesMode()) return;
	closeModelPickerMenu();
	for (const node of app.graph?._nodes ?? []) {
		if (node.comfyClass === CHECKPOINT_LOADER) restoreModelPicker(node, "ckpt_name", "checkpoints");
		else if (node.comfyClass === UNET_LOADER) restoreModelPicker(node, "unet_name", "unet");
	}
}

// Nodes created before Vue mode is toggled on never get nodeCreated again, so
// watch for the mode switch and fix up loaders when it becomes active.
let vueNodesModeWasActive = !!isVueNodesMode();
setInterval(() => {
	const active = !!isVueNodesMode();
	if (active && !vueNodesModeWasActive) ensureVueModelPickers();
	else if (!active && vueNodesModeWasActive) restoreVueModelPickers();
	vueNodesModeWasActive = active;
}, 1000);

app.registerExtension({
	name: "otacoo.previewGrid",
	async init() {
		await Promise.all([loadImageList("checkpoints"), loadImageList("loras"), loadImageList("unet")]);

		const refreshListInNodes = app.refreshComboInNodes;
		if (typeof refreshListInNodes === "function") {
			app.refreshComboInNodes = async function () {
				loraNamesCache = null;
				const r = await refreshListInNodes.apply(this, arguments);
				await loadImageList("checkpoints").catch(() => {});
				await loadImageList("loras").catch(() => {});
				await loadImageList("unet").catch(() => {});
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

					requestAnimationFrame(() => {
						updateMenu(added, type);
					});
					return;
				}
			}
		});

		mutationObserver.observe(document.body, { childList: true, subtree: false });

		// Cover nodes created/loaded before Vue mode was enabled
		ensureVueModelPickers();
	},

	nodeCreated(node) {
		if (node.comfyClass !== LORA_LOADER) {
			// Nodes 2.0 (Vue mode): combo widgets are native dropdowns, so the
			// litecontextmenu preview grid never opens. Replace them with our own
			// picker widget that opens the same preview grid manually.
			if (isVueNodesMode()) {
				if (node.comfyClass === CHECKPOINT_LOADER) addModelPickerWidget(node, "ckpt_name", "checkpoints");
				else if (node.comfyClass === UNET_LOADER) addModelPickerWidget(node, "unet_name", "unet");
			}
			return;
		}

		node.serialize_widgets = true;
		node.loraWidgetCounter = 0;

		const loraListWidget = node.widgets.find((w) => w.name === "lora_list");
		if (loraListWidget) {
			hideWidget(loraListWidget);
			if (loraListWidget.value === undefined || loraListWidget.value === null) loraListWidget.value = "[]";
		}

		// Spacer above the Add LoRA button
		const topMarginSpacer = node.addCustomWidget({
			name: "otacoo_lora_top_margin",
			type: "custom",
			value: null,
			draw: function() {},
			serialize: false,
		});
		topMarginSpacer.computeSize = function() { return [0, 8]; };

		const onAddLora = () => {
			node.loraWidgetCounter++;
			addNewLoraWidget(node, node.loraWidgetCounter);
			syncLoraListToWidget(node);
		};
		const addLoraWidget = node.addCustomWidget({
			name: "otacoo_add_lora_btn",
			type: "custom",
			value: null,
			draw: function(ctx, n, width, posY, height) { drawAddLoraButton(ctx, this, n, width, posY, height); },
			mouse: function(ev, pos, n) { return handleAddLoraButtonMouse(this, ev, pos, n, onAddLora); },
			serialize: false,
		});
		addLoraWidget.computeSize = function() { return [400, 28]; };

		// Spacer between button and LoRA entries
		const spacer = node.addCustomWidget({
			name: "otacoo_lora_spacer",
			type: "custom",
			value: null,
			draw: function() {},
			serialize: false,
		});
		spacer.computeSize = function() { return [0, 10]; };

		requestAnimationFrame(() => {
			restoreLoraWidgetsFromList(node);
		});
	},

	afterConfigureGraph() {
		// Workflow loads replace nodes wholesale, so re-apply pickers
		ensureVueModelPickers();
	},
});

const LORA_WIDGET_MARGIN = 5;
const LORA_VERTICAL_PADDING = 8;
const LORA_INNER_SPACING = 8;

function hitTest(pos, bounds) {
	if (!bounds) return false;
	const [x, y] = pos;
	return x >= bounds[0] && x < bounds[0] + bounds[2] && y >= bounds[1] && y < bounds[1] + bounds[3];
}

function drawAddLoraButton(ctx, widget, node, w, posY, height) {
	if (!ctx) return;
	const margin = LORA_WIDGET_MARGIN;
	widget._posY = posY;
	widget._height = height;
	widget._w = w;
	const left = margin;
	const top = posY;
	const boxW = w - margin * 2;
	const boxH = height;
	const radius = 4;
	const pressed = !!widget._pressed;
	ctx.save();
	ctx.fillStyle = pressed ? "#222" : "#2a2a2a";
	ctx.strokeStyle = pressed ? "#555" : "#444";
	ctx.lineWidth = pressed ? 1.5 : 1;
	if (ctx.roundRect) {
		ctx.beginPath();
		ctx.roundRect(left, top, boxW, boxH, radius);
		ctx.fill();
		ctx.stroke();
	} else {
		ctx.fillRect(left, top, boxW, boxH);
		ctx.strokeRect(left, top, boxW, boxH);
	}
	ctx.fillStyle = pressed ? "#888" : "#aaa";
	ctx.font = "13px Arial";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("+ Add LoRA", left + boxW / 2, top + boxH / 2);
	ctx.restore();
}

function handleAddLoraButtonMouse(widget, event, pos, node, onAddLora) {
	const bounds = [
		LORA_WIDGET_MARGIN,
		widget._posY ?? 0,
		(widget._w ?? 400) - LORA_WIDGET_MARGIN * 2,
		widget._height ?? 28,
	];
	const inside = hitTest(pos, bounds);

	if (event.type === "pointerdown" || event.type === "mousedown") {
		if (inside) {
			widget._pressed = true;
			node.setDirtyCanvas?.(true, true);
		}
		return inside;
	}
	if (event.type === "pointerup" || event.type === "mouseup") {
		if (widget._pressed) {
			widget._pressed = false;
			node.setDirtyCanvas?.(true, true);
			if (inside) onAddLora();
			return true;
		}
	}
	return false;
}

/** Round LoRA strength to 2 decimal places to avoid long floats. */
function loraStrengthTwoDecimals(v) {
	const n = Number(v);
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 1;
}

/** Collect all lora_*_custom widget values and write them into the lora_list widget for execution. */
function syncLoraListToWidget(node) {
	const listWidget = node.widgets.find((w) => w.name === "lora_list");
	if (!listWidget) return;
	const entries = [];
	node.widgets.forEach((w) => {
		if (/^lora_\d+_custom$/.test(w.name) && w.value && typeof w.value === "object") {
			entries.push({
				on: !!w.value.on,
				lora: w.value.lora != null ? String(w.value.lora) : "None",
				strength: loraStrengthTwoDecimals(w.value.strength),
			});
		}
	});
	listWidget.value = JSON.stringify(entries);
	node.setDirtyCanvas?.(true, true);
}

/** When loading a workflow, recreate LoRA rows from the lora_list widget value. */
function restoreLoraWidgetsFromList(node) {
	const listWidget = node.widgets.find((w) => w.name === "lora_list");
	if (!listWidget || !listWidget.value || listWidget.value === "[]") return;
	let entries;
	try {
		entries = JSON.parse(listWidget.value);
	} catch (_) {
		return;
	}
	if (!entries?.length) return;
	const hasCustom = node.widgets.some((w) => /^lora_\d+_custom$/.test(w.name));
	if (hasCustom) return;
	entries.forEach((entry, i) => {
		const index = i + 1;
		if (node.loraWidgetCounter < index) node.loraWidgetCounter = index;
		addNewLoraWidget(node, index);
		const customWidget = node.widgets.find((w) => w.name === `lora_${index}_custom`);
		if (customWidget && customWidget.value) {
			customWidget.value.on = !!entry.on;
			customWidget.value.lora = entry.lora != null ? String(entry.lora) : "None";
			customWidget.value.strength = loraStrengthTwoDecimals(entry.strength);
		}
	});
	syncLoraListToWidget(node);
}

function openModelPickerWithPreview(widget, hiddenCombo, node, ev, type, onPick) {
	const clientX = ev?.clientX ?? window.innerWidth / 2 - 250;
	const clientY = ev?.clientY ?? 150;
	if (app.canvas) app.canvas.last_mouse = [clientX, clientY];

	const getNames = async () => {
		if (type === "loras") return getLoraNames();

		// options.values can be an array, a record, or a function (KJNodes-style).
		let values;
		try {
			const raw = hiddenCombo?.options?.values;
			values = typeof raw === "function" ? raw(hiddenCombo, hiddenCombo.node) : raw;
		} catch (_) {
			values = undefined;
		}
		if (Array.isArray(values) && values.length > 0) return values;
		if (values && typeof values === "object" && Object.keys(values).length > 0) return Object.keys(values);

		const nodeClass = type === "checkpoints" ? CHECKPOINT_LOADER : type === "unet" ? UNET_LOADER : null;
		const comboName = hiddenCombo?.name;
		if (!nodeClass || !comboName) return [];
		try {
			const r = await api.fetchApi(`/object_info/${nodeClass}`);
			const info = await r.json();
			const def = info?.[nodeClass]?.input;
			const spec = def?.required?.[comboName] ?? def?.optional?.[comboName];
			return Array.isArray(spec) && Array.isArray(spec[0]) ? spec[0] : [];
		} catch (_) {
			return [];
		}
	};

	getNames().then((names) => {
		if (!names || names.length === 0) names = ["None"];
		closeModelPickerMenu();
		const menu = document.createElement("div");
		menu.className = "litecontextmenu otacoo-preview-grid";

		const filterWrap = document.createElement("div");
		filterWrap.className = "comfy-context-menu-filter";
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Filter...";
		filterWrap.appendChild(input);
		menu.appendChild(filterWrap);

		const listEl = document.createElement("div");
		listEl.className = "comfy-menu-list otacoo-grid-list";
		names.forEach((name) => {
			const entry = document.createElement("div");
			entry.className = "litemenu-entry";
			entry.setAttribute("data-value", name);
			entry.textContent = name === "None" ? "None" : name.length > 40 ? name.slice(0, 37) + "..." : name;
			entry.addEventListener("click", () => {
				onPick(name);
				node.setDirtyCanvas?.(true, true);
				widget.triggerDraw?.();
				closeModelPickerMenu();
			});
			listEl.appendChild(entry);
		});
		menu.appendChild(listEl);
		activeModelPickerMenu = menu;
		document.body.appendChild(menu);
		requestAnimationFrame(() => updateMenu(menu, type));
		input.focus();
		input.addEventListener("input", () => {
			const q = input.value.toLowerCase();
			listEl.querySelectorAll(".litemenu-entry").forEach((el) => {
				el.style.display = el.getAttribute("data-value").toLowerCase().includes(q) ? "" : "none";
			});
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") closeModelPickerMenu();
		});
	}).catch((err) => {
		console.error("[otacoo] Failed to open model picker:", err);
		if (type === "loras") {
			loraNamesCache = ["None"];
			openModelPickerWithPreview(widget, hiddenCombo, node, ev, type, onPick);
		}
	});
}

function openLoraPickerWithPreview(widget, hiddenCombo, node, ev) {
	openModelPickerWithPreview(widget, hiddenCombo, node, ev, "loras", (name) => {
		widget.value.lora = name;
		if (hiddenCombo) hiddenCombo.value = name;
		syncLoraListToWidget(node);
	});
}

/** Replaces a hidden combo with a custom picker widget (used in Vue/Nodes 2.0 mode). */
function addModelPickerWidget(node, comboName, type) {
	const comboWidget = node.widgets.find((w) => w.name === comboName);
	if (!comboWidget) {
		console.warn(
			`[otacoo] No "${comboName}" widget on ${node.comfyClass}. Widgets:`,
			node.widgets.map((w) => w.name)
		);
		return;
	}
	if (node.widgets.some((w) => w.name === `otacoo_model_picker_${type}`)) return;
	hideWidget(comboWidget);

	const picker = node.addCustomWidget({
		name: `otacoo_model_picker_${type}`,
		type: "custom",
		value: comboWidget.value != null ? String(comboWidget.value) : "",
		serialize: false,
		draw: function (ctx, n, w, posY, height) { drawModelPicker(ctx, this, w, posY, height); },
		mouse: function (ev, pos, n) { return handleModelPickerMouse(this, ev, pos, n, comboWidget, type); },
	});
	picker._combo = comboWidget;
	picker.computeSize = function () { return [400, 30]; };
}

function drawModelPicker(ctx, widget, w, posY, height) {
	if (!ctx) return;

	widget._posY = posY;
	widget._height = height;
	widget._w = w;

	const margin = LORA_WIDGET_MARGIN;
	const left = margin;
	const top = posY;
	const boxW = w - margin * 2;
	const boxH = height;
	const radius = 4;

	ctx.save();
	ctx.fillStyle = "#2a2a2a";
	ctx.strokeStyle = "#444";
	ctx.lineWidth = 1;
	if (ctx.roundRect) {
		ctx.beginPath();
		ctx.roundRect(left, top, boxW, boxH, radius);
		ctx.fill();
		ctx.stroke();
	} else {
		ctx.fillRect(left, top, boxW, boxH);
		ctx.strokeRect(left, top, boxW, boxH);
	}

	const pad = 8;
	const label = widget._combo ? String(widget._combo.value ?? "") : String(widget.value ?? "");
	ctx.fillStyle = "#fff";
	ctx.font = "13px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillText(label.length > 38 ? label.slice(0, 35) + "..." : label, left + pad, top + boxH / 2, boxW - pad * 2 - 20);

	ctx.fillStyle = "#aaa";
	ctx.textAlign = "right";
	ctx.fillText("▾", left + boxW - pad, top + boxH / 2);
	ctx.restore();
}

function handleModelPickerMouse(widget, event, pos, node, hiddenCombo, type) {
	try {
		if (event.type === "pointerdown" || event.type === "mousedown") {
			const bounds = [
				LORA_WIDGET_MARGIN,
				widget._posY ?? 0,
				(widget._w ?? 400) - LORA_WIDGET_MARGIN * 2,
				widget._height ?? 30,
			];
			if (hitTest(pos, bounds)) {
				openModelPickerWithPreview(widget, hiddenCombo, node, event, type, (name) => {
					widget.value = name;
					if (hiddenCombo) hiddenCombo.value = name;
				});
				return true;
			}
		}
	} catch (err) {
		console.error("[otacoo] Model picker mouse handler failed:", err);
	}
	return false;
}

function addNewLoraWidget(node, index) {
	const loraList = ["None"];
	const comboWidget = node.addWidget("combo", `lora_name_${index}`, "None", (v) => {
		const customWidget = node.widgets.find(w => w.name === `lora_${index}_custom`);
		if (customWidget) {
			customWidget.value.lora = v;
			node.setDirtyCanvas(true, true);
		}
	}, { values: loraList });
	hideWidget(comboWidget);

	const customWidget = node.addCustomWidget({
		name: `lora_${index}_custom`,
		type: "custom",
		value: {
			on: true,
			lora: "None",
			strength: 1.0,
		},
		draw: function(ctx, node, w, posY, height) {
			drawLoraWidget(ctx, this, node, w, posY, height);
		},
		mouse: function(ev, pos, n) { return handleLoraWidgetMouse(this, ev, pos, n, comboWidget); },
		serialize: true,
	});

	customWidget.computeSize = function() {
		return [400, 30];
	};
}

function drawLoraWidget(ctx, widget, node, w, posY, height) {
	if (!ctx) return;

	const margin = LORA_WIDGET_MARGIN;
	const padV = LORA_VERTICAL_PADDING;
	const inner = LORA_INNER_SPACING;
	const left = margin;
	const top = posY;
	const boxW = w - margin * 2;
	const boxH = height;
	const contentTop = posY + padV;
	const contentH = height - padV * 2;
	const midY = contentTop + contentH * 0.5;
	const contentLeft = margin;
	const contentRight = w - margin;
	let posX = contentLeft;

	widget._posY = posY;
	widget._height = height;
	widget._w = w;

	const radius = 4;
	ctx.save();
	ctx.fillStyle = "#2a2a2a";
	ctx.strokeStyle = "#444";
	ctx.lineWidth = 1;
	if (ctx.roundRect) {
		ctx.beginPath();
		ctx.roundRect(left, top, boxW, boxH, radius);
		ctx.fill();
		ctx.stroke();
	} else {
		ctx.fillRect(left, top, boxW, boxH);
		ctx.strokeRect(left, top, boxW, boxH);
	}

	const toggleRadius = 7;
	const toggleInset = 1;
	const toggleX = contentLeft + toggleInset + toggleRadius;
	const toggleY = midY;
	ctx.fillStyle = widget.value.on ? "#4CAF50" : "#555";
	ctx.beginPath();
	ctx.arc(toggleX, toggleY, toggleRadius, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 1.5;
	ctx.stroke();
	widget.toggleBounds = [toggleX - toggleRadius, toggleY - toggleRadius, toggleRadius * 2, toggleRadius * 2];

	posX = toggleX + toggleRadius + inner;

	const maxLoraWidth = contentRight - posX - 100 - margin;
	ctx.fillStyle = widget.value.on ? "#fff" : "#aaa";
	ctx.font = "13px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	const loraLabel = widget.value.lora || "None";
	ctx.fillText(loraLabel.substring(0, 30), posX, midY, maxLoraWidth);
	widget.loraBounds = [posX, posY, maxLoraWidth, height];

	const removeButtonWidth = 22;
	const strengthDisplayWidth = 55;
	const strengthX = contentRight - removeButtonWidth - inner - strengthDisplayWidth;
	ctx.fillStyle = "#aaa";
	ctx.font = "12px Arial";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	ctx.fillText("S: " + widget.value.strength.toFixed(2), strengthX + strengthDisplayWidth - 5, midY);
	widget.strengthBounds = [strengthX - 5, posY, strengthDisplayWidth + 10, height];

	const removeSize = 18;
	const removeInset = 1;
	const removeX = contentRight - removeSize - removeInset;
	const removeY = midY - removeSize / 2;
	const removeRadius = 3;
	ctx.fillStyle = "#f44336";
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 1.5;
	if (ctx.roundRect) {
		ctx.beginPath();
		ctx.roundRect(removeX, removeY, removeSize, removeSize, removeRadius);
		ctx.fill();
		ctx.stroke();
	} else {
		ctx.fillRect(removeX, removeY, removeSize, removeSize);
		ctx.strokeRect(removeX, removeY, removeSize, removeSize);
	}
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 2;
	const removePad = 5;
	ctx.beginPath();
	ctx.moveTo(removeX + removePad, removeY + removePad);
	ctx.lineTo(removeX + removeSize - removePad, removeY + removeSize - removePad);
	ctx.moveTo(removeX + removeSize - removePad, removeY + removePad);
	ctx.lineTo(removeX + removePad, removeY + removeSize - removePad);
	ctx.stroke();
	widget.removeBounds = [removeX, removeY, removeSize, removeSize];

	ctx.restore();
}

function handleLoraWidgetMouse(widget, event, pos, node, hiddenCombo) {
	if (event.type === "pointerdown" || event.type === "mousedown") {
		const [x, y] = pos;
		const w = widget._w ?? 400;
		const height = widget._height ?? 30;
		const posY = widget._posY ?? 0;
		const margin = LORA_WIDGET_MARGIN;
		const left = margin;
		const top = posY;
		const boxW = w - margin * 2;
		const boxH = height;
		const inContent = x >= left && x < left + boxW && y >= top && y < top + boxH;

		if (hitTest(pos, widget.toggleBounds)) {
			widget.value.on = !widget.value.on;
			syncLoraListToWidget(node);
			node.setDirtyCanvas(true, true);
			return true;
		}
		if (hitTest(pos, widget.removeBounds)) {
			node.widgets = node.widgets.filter(w => w !== widget && w !== hiddenCombo);
			syncLoraListToWidget(node);
			node.setDirtyCanvas(true, true);
			return true;
		}
		if (hitTest(pos, widget.strengthBounds)) {
			widget.isDraggingStrength = true;
			widget.dragStartX = x;
			widget.dragStartStrength = widget.value.strength;
			widget.dragStartTime = Date.now();
			return true;
		}

		if (inContent) {
			openLoraPickerWithPreview(widget, hiddenCombo, node, event);
			return true;
		}
		return false;
	} else if (event.type === "pointermove" || event.type === "mousemove") {
		if (widget.isDraggingStrength) {
			const [x] = pos;
			const delta = (x - widget.dragStartX) * 0.01;
			widget.value.strength = loraStrengthTwoDecimals(Math.max(-100, Math.min(100, widget.dragStartStrength + delta)));
			syncLoraListToWidget(node);
			node.setDirtyCanvas(true, true);
			return true;
		}
	} else if (event.type === "pointerup" || event.type === "mouseup") {
		if (widget.isDraggingStrength) {
			const timeDragged = Date.now() - (widget.dragStartTime || 0);
			const distanceDragged = Math.abs(widget.dragStartX - pos[0]);

			widget.isDraggingStrength = false;

			if (timeDragged < 200 && distanceDragged < 3) {
				const currentValue = widget.value.strength;
				app.canvas.prompt("Enter LoRA Strength", currentValue.toFixed(2), (v) => {
					const newValue = parseFloat(v);
					if (!isNaN(newValue)) {
						widget.value.strength = loraStrengthTwoDecimals(Math.max(-100, Math.min(100, newValue)));
						syncLoraListToWidget(node);
						node.setDirtyCanvas(true, true);
					}
				}, event);
			}
		}
	}

	return false;
}
