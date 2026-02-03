import folder_paths
import comfy.sd
import comfy.utils


def get_lora_list():
    return ["None"] + folder_paths.get_filename_list("loras")


def build_input_types():
    required = {
        "model": ("MODEL", {"tooltip": "The LoRAs to apply to the model."}),
        "clip": ("CLIP", {"tooltip": "The CLIP strength to apply to the model."}),
    }
    for i in range(1, 6):
        required[f"lora_name_{i}"] = (get_lora_list(), {"default": "None"})
        required[f"strength_model_{i}"] = ("FLOAT", {
            "default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
        })
        required[f"strength_clip_{i}"] = ("FLOAT", {
            "default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
        })
    return {"required": required}


class OtacooLoraLoader:

    def __init__(self):
        self._loaded_loras = {}

    @classmethod
    def INPUT_TYPES(cls):
        return build_input_types()

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "load_lora"
    CATEGORY = "loaders"

    def load_lora(
        self,
        model,
        clip,
        lora_name_1,
        strength_model_1,
        strength_clip_1,
        lora_name_2,
        strength_model_2,
        strength_clip_2,
        lora_name_3,
        strength_model_3,
        strength_clip_3,
        lora_name_4,
        strength_model_4,
        strength_clip_4,
        lora_name_5,
        strength_model_5,
        strength_clip_5,
    ):
        names = [lora_name_1, lora_name_2, lora_name_3, lora_name_4, lora_name_5]
        strengths_model = [
            strength_model_1,
            strength_model_2,
            strength_model_3,
            strength_model_4,
            strength_model_5,
        ]
        strengths_clip = [
            strength_clip_1,
            strength_clip_2,
            strength_clip_3,
            strength_clip_4,
            strength_clip_5,
        ]

        for name, sm, sc in zip(names, strengths_model, strengths_clip):
            if not name or name == "None" or (sm == 0 and sc == 0):
                continue

            lora_path = folder_paths.get_full_path_or_raise("loras", name)
            lora = self._loaded_loras.get(lora_path)
            if lora is None:
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                self._loaded_loras[lora_path] = lora

            model, clip = comfy.sd.load_lora_for_models(model, clip, lora, sm, sc)

        return (model, clip)


NODE_CLASS_MAPPINGS = {
    "OtacooLoraLoader": OtacooLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooLoraLoader": "LoRA Loader 🔰",
}
