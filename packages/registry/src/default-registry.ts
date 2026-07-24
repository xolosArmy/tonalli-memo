import { parseRegistry } from "./parse.js";
import { REGISTRY_DATA } from "./registry-data.js";
import type { RegistryDocument } from "./types.js";

export const DEFAULT_REGISTRY: RegistryDocument = parseRegistry(REGISTRY_DATA);
