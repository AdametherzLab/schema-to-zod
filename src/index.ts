/**
 * Public API barrel file for schema-to-zod.
 * 
 * Re-exports all public functions and types for programmatic usage.
 * Import from this module to access type inference, code generation,
 * and CLI capabilities without spawning a subprocess.
 * 
 * @example
 * 
 * import { inferFromSamples, generateOutput, main } from "schema-to-zod";
 * 
 * // Infer types from sample data
 * const inferred = inferFromSamples([{ id: 1, name: "Item" }]);
 * 
 * // Generate TypeScript interface and Zod schema
 * const { combinedOutput } = generateOutput(inferred.properties, {
 *   interfaceName: "Item",
 *   schemaName: "ItemSchema"
 * });
 * 
 * 
 * @module
 */

export {
  inferType,
  inferFromSamples,
  mergeInferredTypes,
} from "./infer.js";

export {
  generateInterface,
  generateZodSchema,
  generateOutput,
  type GeneratedOutput,
} from "./codegen.js";

export {
  fromOpenApiSchema,
  fromOpenApiDocument,
  type OpenApiSchema,
  type OpenApiDocument,
  type OpenApiConvertOptions,
} from "./openapi.js";

export { main } from "./cli.js";

export * from "./types.js";
