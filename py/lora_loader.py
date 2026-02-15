import json
from pathlib import Path

import folder_paths
import comfy.sd
import comfy.utils


def get_lora_list():
    return ["None"] + folder_paths.get_filename_list("loras")


def get_trigger_words(lora_path):
    """
    Gets trigger words from JSON files with the same base name as the LoRA.
    - .json: value of "activation text" .
    - .metadata.json: value of "trainedWords" under "modelVersions".
    """
    words = []
    path = Path(lora_path)
    base = path.stem
    parent = path.parent

    json_path = parent / f"{base}.json"
    if json_path.is_file():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            activation = data.get("activation text") or data.get("activation_text")
            if isinstance(activation, str) and activation.strip():
                words.extend(x.strip() for x in activation.split(",") if x.strip())
        except (json.JSONDecodeError, OSError):
            pass

    meta_path = parent / f"{base}.metadata.json"
    if meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            versions = data.get("modelVersions")
            if isinstance(versions, list) and versions:
                trained = versions[0].get("trainedWords") if isinstance(versions[0], dict) else None
                if isinstance(trained, list):
                    words.extend(str(x).strip() for x in trained if x)
        except (json.JSONDecodeError, OSError):
            pass

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
    RETURN_NAMES = ("MODEL", "CLIP", "TRIGGER WORDS")
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
                lora_path_key = str(lora_path)
                lora = self._loaded_loras.get(lora_path_key)
                if lora is None:
                    try:
                        result = comfy.utils.load_torch_file(lora_path, safe_load=True, return_metadata=True)
                        if isinstance(result, tuple) and len(result) >= 2:
                            lora = result[0]
                        else:
                            lora = result
                    except TypeError:
                        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    self._loaded_loras[lora_path_key] = lora
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora, strength, strength)
                words = get_trigger_words(lora_path)
                all_trigger_words.extend(words)
            except Exception as e:
                print(f"[OtacooLoraLoader] Error loading LoRA {lora_name}: {e}")
                import traceback
                traceback.print_exc()
                continue

        trigger_words_text = ", ".join(dict.fromkeys(all_trigger_words)) if all_trigger_words else ""
        return (model, clip, trigger_words_text)


NODE_CLASS_MAPPINGS = {
    "OtacooLoraLoader": OtacooLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooLoraLoader": "LoRA Loader 🔰",
}
