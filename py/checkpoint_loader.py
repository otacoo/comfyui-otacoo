import folder_paths
import comfy.sd
import comfy.utils


def get_vae_list():
    """VAE list with 'default' for checkpoint built-in VAE."""
    vaes = folder_paths.get_filename_list("vae")
    return ["default"] + vaes


class OtacooCheckpointLoader:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"), {
                    "tooltip": "The checkpoint model to load.",
                }),
            },
            "optional": {
                "vae_name": (get_vae_list(), {
                    "default": "default",
                    "tooltip": "Use 'default' for the checkpoint's VAE, or pick a separate VAE file.",
                }),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "load_checkpoint"
    CATEGORY = "loaders"

    def load_checkpoint(self, ckpt_name, vae_name="default"):
        ckpt_path = folder_paths.get_full_path_or_raise("checkpoints", ckpt_name)
        model, clip, vae = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )[:3]

        if vae_name and vae_name != "default":
            vae_path = folder_paths.get_full_path_or_raise("vae", vae_name)
            vae_sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
            vae = comfy.sd.VAE(sd=vae_sd, metadata=metadata)
            vae.throw_exception_if_invalid()

        return (model, clip, vae)


NODE_CLASS_MAPPINGS = {
    "OtacooCheckpointLoader": OtacooCheckpointLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OtacooCheckpointLoader": "Checkpoint Loader 🔰",
}
