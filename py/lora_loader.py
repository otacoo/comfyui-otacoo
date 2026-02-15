import json
import folder_paths
import comfy.sd
import comfy.utils


def get_lora_list():
    return ["None"] + folder_paths.get_filename_list("loras")


class FlexibleOptionalInputType(dict):
    """Allows flexible optional inputs of any type."""
    def __init__(self, type=None, data=None):
        self.type = type
        data = data or {}
        super().__init__(data)


any_type = "ANY"


class OtacooLoraLoader:

    def __init__(self):
        self._loaded_loras = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": FlexibleOptionalInputType(type=any_type, data={
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_list": ("STRING", {"default": "[]"}),
            }),
            "hidden": {},
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

    def load_lora(self, model=None, clip=None, lora_list="[]", **kwargs):
        """
        Load LoRAs from lora_list JSON string.
        Each entry: {"on": bool, "lora": str, "strength": float}
        """
        try:
            entries = json.loads(lora_list) if isinstance(lora_list, str) else lora_list
        except (json.JSONDecodeError, TypeError):
            entries = []
        if not isinstance(entries, list):
            entries = []

        for i, value in enumerate(entries):
            if not isinstance(value, dict):
                continue
            if not value.get("on", False):
                continue
            lora_name = value.get("lora")
            strength = value.get("strength", 1.0)
            if not lora_name or lora_name == "None":
                continue
            try:
                strength = float(strength)
            except (ValueError, TypeError):
                strength = 1.0
            if strength == 0:
                continue
            if model is None:
                continue
            try:
                lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
                lora = self._loaded_loras.get(lora_path)
                if lora is None:
                    lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    self._loaded_loras[lora_path] = lora
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora, strength, strength)
            except Exception as e:
                print(f"[OtacooLoraLoader] Error loading LoRA {lora_name}: {e}")
                import traceback
                traceback.print_exc()
                continue
        return (model, clip)


NODE_CLASS_MAPPINGS = {
    "OtacooLoraLoader": OtacooLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooLoraLoader": "LoRA Loader 🔰",
}
