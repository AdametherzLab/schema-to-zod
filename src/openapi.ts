import type {
  InferredType,
  InferredField,
  MergeOptions,
} from "./types.js";

/**
 * Represents an OpenAPI 3.0/3.1 or Swagger 2.0 schema object.
 */
export interface OpenApiSchema {
  readonly type?: string | string[];
  readonly format?: string;
  readonly enum?: string[];
  readonly properties?: Record<string, OpenApiSchema>;
  readonly items?: OpenApiSchema;
  readonly required?: string[];
  readonly nullable?: boolean;
  readonly allOf?: OpenApiSchema[];
  readonly anyOf?: OpenApiSchema[];
  readonly oneOf?: OpenApiSchema[];
  readonly $ref?: string;
  readonly description?: string;
}

/**
 * Represents a complete OpenAPI/Swagger document.
 */
export interface OpenApiDocument {
  readonly openapi?: string;
  readonly swagger?: string;
  readonly paths?: Record<string, unknown>;
  readonly components?: {
    readonly schemas?: Record<string, OpenApiSchema>;
  };
  readonly definitions?: Record<string, OpenApiSchema>;
}

/**
 * Options for converting OpenAPI schemas to inferred types.
 */
export interface OpenApiConvertOptions extends MergeOptions {
  /** Whether to make all fields optional by default (useful for partial types) */
  readonly defaultOptional?: boolean;
  /** Reference resolver for $ref (basic implementation) */
  readonly resolveRef?: (ref: string) => OpenApiSchema | undefined;
}

function convertOpenApiSchema(
  schema: OpenApiSchema,
  options: OpenApiConvertOptions = {}
): InferredType {
  // Handle $ref
  if (schema.$ref) {
    if (options.resolveRef) {
      const resolved = options.resolveRef(schema.$ref);
      if (resolved) {
        return convertOpenApiSchema(resolved, options);
      }
    }
    return { kind: "scalar", type: "string" };
  }

  // Handle nullable (OpenAPI 3.0 style)
  const isNullable = schema.nullable === true;
  
  // Handle type arrays (OpenAPI 3.1 style) like ["string", "null"]
  let type = schema.type;
  if (Array.isArray(type)) {
    const nonNullTypes = type.filter((t) => t !== "null");
    if (nonNullTypes.length === 1) {
      type = nonNullTypes[0];
    } else if (nonNullTypes.length > 1) {
      // Multiple types - create union
      const variants = nonNullTypes.map((t) => 
        convertOpenApiSchema({ ...schema, type: t }, options)
      );
      const union: InferredType = { kind: "union", variants };
      return isNullable && !type.includes("null")
        ? { kind: "union", variants: [union, { kind: "scalar", type: "null" }] }
        : union;
    }
  }

  let inferred: InferredType;

  if (schema.enum && type === "string") {
    inferred = { kind: "enum", values: schema.enum };
  } else if (type === "string") {
    if (schema.format === "date-time" || schema.format === "date") {
      inferred = { kind: "scalar", type: "date" };
    } else {
      inferred = { kind: "scalar", type: "string" };
    }
  } else if (type === "integer") {
    inferred = { kind: "scalar", type: "integer" };
  } else if (type === "number") {
    inferred = { kind: "scalar", type: "float" };
  } else if (type === "boolean") {
    inferred = { kind: "scalar", type: "boolean" };
  } else if (type === "array" && schema.items) {
    inferred = {
      kind: "array",
      elementType: convertOpenApiSchema(schema.items, options),
    };
  } else if (type === "object" || schema.properties) {
    const properties: Record<string, InferredField> = {};
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      const isOptional = !required.has(key) || options.defaultOptional === true;
      properties[key] = {
        type: convertOpenApiSchema(propSchema, options),
        isOptional,
      };
    }

    inferred = { kind: "object", properties };
  } else if (schema.allOf || schema.anyOf || schema.oneOf) {
    const schemas = schema.allOf || schema.anyOf || schema.oneOf || [];
    if (schemas.length === 0) {
      inferred = { kind: "scalar", type: "string" };
    } else if (schemas.length === 1) {
      inferred = convertOpenApiSchema(schemas[0], options);
    } else {
      const variants = schemas.map((s) => convertOpenApiSchema(s, options));
      inferred = { kind: "union", variants };
    }
  } else {
    inferred = { kind: "scalar", type: "string" };
  }

  // Wrap in union if nullable
  if (isNullable && inferred.kind !== "union") {
    return {
      kind: "union",
      variants: [inferred, { kind: "scalar", type: "null" }],
    };
  }

  return inferred;
}

/**
 * Convert a single OpenAPI schema to an inferred type.
 * @param schema - The OpenAPI schema object
 * @param options - Conversion options
 * @returns The inferred type representation
 * @example
 * const schema = { type: "object", properties: { id: { type: "integer" } } };
 * const type = fromOpenApiSchema(schema);
 */
export function fromOpenApiSchema(
  schema: OpenApiSchema,
  options?: OpenApiConvertOptions
): InferredType {
  return convertOpenApiSchema(schema, options);
}

/**
 * Extract and convert all schemas from an OpenAPI document.
 * Handles both OpenAPI 3.0 (components.schemas) and Swagger 2.0 (definitions).
 * @param doc - The OpenAPI/Swagger document
 * @param options - Conversion options
 * @returns Record of schema names to their inferred types
 * @example
 * const doc = { openapi: "3.0.0", components: { schemas: { User: { type: "object" } } } };
 * const types = fromOpenApiDocument(doc);
 * // types.User will be the inferred type for the User schema
 */
export function fromOpenApiDocument(
  doc: OpenApiDocument,
  options?: OpenApiConvertOptions
): Record<string, InferredType> {
  const schemas: Record<string, OpenApiSchema> = {};
  
  // Collect all schemas from components/schemas (OpenAPI 3.0) or definitions (Swagger 2.0)
  if (doc.components?.schemas) {
    Object.assign(schemas, doc.components.schemas);
  }
  if (doc.definitions) {
    Object.assign(schemas, doc.definitions);
  }

  const result: Record<string, InferredType> = {};
  
  // Create resolver for refs
  const resolveRef = (ref: string): OpenApiSchema | undefined => {
    if (ref.startsWith("#/components/schemas/")) {
      const name = ref.replace("#/components/schemas/", "");
      return schemas[name];
    }
    if (ref.startsWith("#/definitions/")) {
      const name = ref.replace("#/definitions/", "");
      return schemas[name];
    }
    return undefined;
  };

  const optsWithResolver: OpenApiConvertOptions = {
    ...options,
    resolveRef,
  };

  for (const [name, schema] of Object.entries(schemas)) {
    result[name] = convertOpenApiSchema(schema, optsWithResolver);
  }

  return result;
}
