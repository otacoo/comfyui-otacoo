import folder_paths
import comfy.sd
import torch

class OtacooUnetLoader:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "unet_name": (folder_paths.get_filename_list("unet"), {
                    "tooltip": "The UNet model to load.",
                }),
            },
            "optional": {
                "weight_dtype": (["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"], {
                    "default": "default",
                    "tooltip": "The weight precision to load the model with.",
                }),
            },
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("MODEL",)
    FUNCTION = "load_unet"
    CATEGORY = "loaders"

    def load_unet(self, unet_name, weight_dtype="default"):
        model_options = {}
        if weight_dtype == "fp8_e4m3fn":
            model_options["dtype"] = torch.float8_e4m3fn
        elif weight_dtype == "fp8_e4m3fn_fast":
            model_options["dtype"] = torch.float8_e4m3fn
            model_options["fp8_optimizations"] = True
        elif weight_dtype == "fp8_e5m2":
            model_options["dtype"] = torch.float8_e5m2

        unet_path = folder_paths.get_full_path_or_raise("unet", unet_name)
        model = comfy.sd.load_diffusion_model(unet_path, model_options=model_options)
        return (model,)


NODE_CLASS_MAPPINGS = {
    "OtacooUnetLoader": OtacooUnetLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooUnetLoader": "UNet Loader \U0001f530",
}
