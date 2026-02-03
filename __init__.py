import importlib.util
import glob
import os
import sys

def _get_ext_dir(subdir):
    """Returns the absolute path to a subdirectory of this extension."""
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, subdir)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

if True:  # load nodes from py/
    py = _get_ext_dir("py")
    files = glob.glob(os.path.join(py, "*.py"), recursive=False)
    for file in files:
        name = os.path.splitext(file)[0]
        spec = importlib.util.spec_from_file_location(name, file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        if hasattr(module, "NODE_CLASS_MAPPINGS") and getattr(module, "NODE_CLASS_MAPPINGS") is not None:
            NODE_CLASS_MAPPINGS.update(module.NODE_CLASS_MAPPINGS)
            if hasattr(module, "NODE_DISPLAY_NAME_MAPPINGS") and getattr(module, "NODE_DISPLAY_NAME_MAPPINGS") is not None:
                NODE_DISPLAY_NAME_MAPPINGS.update(module.NODE_DISPLAY_NAME_MAPPINGS)

# Server routes for model preview images
def _register_routes():
    try:
        from server import PromptServer
        from aiohttp import web
        from urllib.parse import quote
        import folder_paths
    except ImportError:
        return
    if not getattr(PromptServer, "instance", None):
        return
    routes = PromptServer.instance.routes
    preview_suffixes = (
        ".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp",
        ".png", ".jpg", ".jpeg", ".webp",
    )

    def _safe_name(name):
        if not name or ".." in name or os.path.sep in name or (os.path.altsep and os.path.altsep in name):
            return None
        return name

    def _find_preview_for_model(model_type, model_name):
        try:
            model_path = folder_paths.get_full_path(model_type, model_name)
        except Exception:
            return None
        if not model_path or not os.path.isfile(model_path):
            return None
        folder = os.path.dirname(model_path)
        base = os.path.splitext(model_name)[0]
        for suffix in preview_suffixes:
            path = os.path.join(folder, base + suffix)
            if os.path.isfile(path):
                return path
        return None

    @routes.get("/otacoo/images/{model_type}")
    async def otacoo_images(request):
        model_type = request.match_info.get("model_type", "")
        if model_type not in ("checkpoints", "loras"):
            return web.json_response({})
        out = {}
        try:
            names = folder_paths.get_filename_list(model_type)
        except Exception:
            return web.json_response({})
        for name in names:
            if not _safe_name(name):
                continue
            if _find_preview_for_model(model_type, name):
                out[name] = f"/otacoo/preview?type={model_type}&name={quote(name, safe='')}"
        return web.json_response(out)

    @routes.get("/otacoo/preview")
    async def otacoo_preview(request):
        model_type = request.query.get("type", "")
        name = request.query.get("name", "")
        if model_type not in ("checkpoints", "loras") or not _safe_name(name):
            raise web.HTTPNotFound()
        path = _find_preview_for_model(model_type, name)
        if path and os.path.isfile(path):
            return web.FileResponse(path)
        raise web.HTTPNotFound()

_register_routes()

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
