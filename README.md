# ComfyUI-Otacoo

ComfyUI custom nodes for loading checkpoints and LoRAs with **model image previews** in the selector. When you open the model dropdown (classic UI), you get a grid of thumbnails instead of a plain list.

## Nodes

### Checkpoint Loader 🔰

- Loads a checkpoint (MODEL, CLIP, VAE) just like the built-in loader.
- **Optional separate VAE:** Choose “default” to use the checkpoint’s built-in VAE, or pick another VAE from your `models/vae` folder.
- **Preview grid:** Select your model using a grid with preview images.

### LoRA Loader 🔰

- Apply **up to 5 LoRAs** in one node, each with its own **strength_model** and **strength_clip**.
- **Preview grid:** Select your model using a grid with preview images.

## Preview images

Previews are loaded from **ComfyUI’s model folders** (same folder as the model file). Place an image next to the model with the same base name:

| Model file | Preview file (any of these) |
|------------|----------------------------|
| `example.safetensors` | `example.preview.jpg`, `example.png`, etc. |

**Names checked (first match wins):**  
`<basename>.preview.png`, `.preview.jpg`, `.preview.jpeg`, `.preview.webp`  
`<basename>.png`, `.jpg`, `.jpeg`, `.webp`

Example: for `myModel.safetensors` in `models/checkpoints/`, add `myModel.preview.png` (or `myModel.png`) in the same folder.

## Installation

Clone or copy into `ComfyUI/custom_nodes/`:

```git clone https://github.com/otacoo/comfyui-otacoo.git```


## Nodes 2.0

Currently previews only work with **LiteGraph.**\
**Nodes 2.0** support will be added once ComfyUI adds support for custom nodes in Vue UI.
