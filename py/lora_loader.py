import json
from pathlib import Path

import folder_paths
import comfy.sd
import comfy.utils


def get_lora_list():
    return ["None"] + folder_paths.get_filename_list("loras")


def get_trigger_words(lora_path):
    """Gets trigger words from .json or .metadata.json files."""
    def load_json(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    words = []
    path = Path(lora_path)
    base = path.stem
    parent = path.parent

    # Try .json file
    data = load_json(parent / f"{base}.json")
    if data:
        activation = data.get("activation text") or data.get("activation_text")
        if isinstance(activation, str):
            words.extend(x.strip() for x in activation.split(",") if x.strip())

    # Try .metadata.json file
    data = load_json(parent / f"{base}.metadata.json")
    if data and isinstance(data.get("modelVersions"), list) and data["modelVersions"]:
        trained = data["modelVersions"][0].get("trainedWords", [])
        if isinstance(trained, list):
            words.extend(str(x).strip() for x in trained if x)

    return words


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

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "Trigger Words")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

    def load_lora(self, model=None, clip=None, lora_list="[]", **kwargs):
        """
        Load LoRAs from lora_list JSON string.
        Each entry: {"on": bool, "lora": str, "strength": float}
        Returns (model, clip, trigger_words_text).
        """
        try:
            entries = json.loads(lora_list) if isinstance(lora_list, str) else lora_list
        except (json.JSONDecodeError, TypeError):
            entries = []
        
        if not isinstance(entries, list):
            entries = []

        all_trigger_words = []

        for entry in entries:
            if not isinstance(entry, dict) or not entry.get("on"):
                continue
            
            lora_name = entry.get("lora")
            if not lora_name or lora_name == "None":
                continue
            
            try:
                strength = float(entry.get("strength", 1.0))
            except (ValueError, TypeError):
                strength = 1.0
            
            if strength == 0 or model is None:
                continue

            try:
                lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
                lora = self._loaded_loras.get(lora_path)
                
                if lora is None:
                    try:
                        result = comfy.utils.load_torch_file(lora_path, safe_load=True, return_metadata=True)
                        lora = result[0] if isinstance(result, tuple) else result
                    except TypeError:
                        # Fallback for older comfy versions without return_metadata
                        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    self._loaded_loras[lora_path] = lora
                
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora, strength, strength)
                all_trigger_words.extend(get_trigger_words(lora_path))
            except Exception as e:
                print(f"[OtacooLoraLoader] Error loading LoRA {lora_name}: {e}")

        return (model, clip, ", ".join(dict.fromkeys(all_trigger_words)) if all_trigger_words else "")


NODE_CLASS_MAPPINGS = {
    "OtacooLoraLoader": OtacooLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooLoraLoader": "LoRA Loader 🔰",
}
