import path from "path"

process.env.TIANCODE_DB = ":memory:"
process.env.TIANCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.TIANCODE_DISABLE_MODELS_FETCH = "true"
