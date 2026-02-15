/**
 * Global Sampler - automatically applies sampler/scheduler to all KSampler nodes on generation.
 */
import { app } from "../../../scripts/app.js";

let globalSamplerNode = null;

app.registerExtension({
	name: "otacoo.global",

	setup() {
		// Intercept queuePrompt to apply global sampler before execution
		const origQueuePrompt = app.queuePrompt.bind(app);
		app.queuePrompt = async function() {
			if (globalSamplerNode) {
				applyGlobalSampler();
			}
			return await origQueuePrompt();
		};
	},

	nodeCreated(node) {
		if (node.comfyClass === "OtacooGlobalSampler") {
			globalSamplerNode = node;
		}
	},
});

function applyGlobalSampler() {
	const samplerWidget = globalSamplerNode.widgets?.find(w => w.name === "sampler_name");
	const schedulerWidget = globalSamplerNode.widgets?.find(w => w.name === "scheduler");

	if (!samplerWidget || !schedulerWidget) return;

	const samplerName = samplerWidget.value;
	const scheduler = schedulerWidget.value;
	let affectedCount = 0;

	// Apply sampler/scheduler to all KSampler nodes
	for (const nodeId in app.graph._nodes) {
		const node = app.graph._nodes[nodeId];
		if (!node.widgets) continue;

		const samplerNodeWidget = node.widgets.find(w => w.name === "sampler_name");
		const schedulerNodeWidget = node.widgets.find(w => w.name === "scheduler");

		if (samplerNodeWidget) {
			samplerNodeWidget.value = samplerName;
			affectedCount++;
		}
		if (schedulerNodeWidget) {
			schedulerNodeWidget.value = scheduler;
		}
	}

	if (affectedCount > 0) {
		app.canvas.draw(true, true);
	}
}
