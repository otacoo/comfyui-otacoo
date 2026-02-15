"""
Global Sampler node - sets sampler and scheduler globally on all KSampler nodes.
"""

import comfy.samplers


class OtacooGlobalSampler:

	@classmethod
	def INPUT_TYPES(cls):
		return {
			"required": {
				"sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"default": "euler"}),
				"scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"default": "normal"}),
			}
		}

	RETURN_TYPES = ()
	FUNCTION = "doit"
	CATEGORY = "utils"

	def doit(self, **kwargs):
		"""No-op node - actual work happens in frontend before generation"""
		return ()


NODE_CLASS_MAPPINGS = {
	"OtacooGlobalSampler": OtacooGlobalSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
	"OtacooGlobalSampler": "Global Sampler 🔰",
}
