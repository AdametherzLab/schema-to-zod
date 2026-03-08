import type {
  InferredType,
  StringType,
  NumberType,
  IntegerType,
  FloatType,
  BooleanType,
  NullType,
  DateType,
  ObjectType,
  ArrayType,
  UnionType,
  InferredField,
  MergeOptions,
  EnumType,
} from "./types.js";

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Check if a string matches ISO 8601 datetime format.
 * @param value - The string to check
 * @returns True if valid ISO 8601 date string
 */
function isIso8601Date(value: string): boolean {
  return ISO_8601_REGEX.test(value);
}

/**
 * Recursively infer the type of a JSON value.
 * @param value - Any JSON value (primitive, object, or array)
 * @param options - Configuration for type inference
 * @returns The inferred type structure
 * @throws {TypeError} For unsupported value types (undefined, function, symbol, bigint)
 * @example
 * const type = inferType({ name: "John", age: 30 });
 * // Returns ObjectType with string and integer properties
 */
export function inferType(value: unknown, options?: MergeOptions): InferredType {
  if (value === null) {
    return { kind: "scalar", type: "null" } satisfies NullType;
  }

  if (typeof value === "boolean") {
    return { kind: "scalar", type: "boolean" } satisfies BooleanType;
  }

  if (typeof value === "number") {
    if (options?.strictNumberTypes === false) {
      return { kind: "scalar", type: "number" } satisfies NumberType;
    }
    return Number.isInteger(value)
      ? ({ kind: "scalar", type: "integer" } satisfies IntegerType)
      : ({ kind: "scalar", type: "float" } satisfies FloatType);
  }

  if (typeof value === "string") {
    if (options?.coerceDates !== false && isIso8601Date(value)) {
      return { kind: "scalar", type: "date" } satisfies DateType;
    }
    return { kind: "scalar", type: "string" } satisfies StringType;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        kind: "array",
        elementType: { kind: "scalar", type: "null" }, // Default to null for empty arrays
      } satisfies ArrayType;
    }

    // Check if all elements are strings and infer enum if option is enabled
    if (options?.inferEnums && value.every(item => typeof item === "string")) {
      // Ensure uniqueness and sort for consistent enum definition
      const uniqueValues = Array.from(new Set(value as string[])).sort();
      return { kind: "enum", values: uniqueValues } satisfies EnumType;
    }

    const elementType = value.slice(1).reduce(
      (acc, item) => mergeInferredTypes(acc, inferType(item, options)),
      inferType(value[0], options)
    );

    return { kind: "array", elementType } satisfies ArrayType;
  }

  if (typeof value === "object" && value !== null) {
    const properties: Record<string, InferredField> = {};

    for (const [key, val] of Object.entries(value)) {
      properties[key] = {
        type: inferType(val, options),
        isOptional: false,
      };
    }

    return { kind: "object", properties } satisfies ObjectType;
  }

  throw new TypeError(`Unsupported value type: ${typeof value}`);
}

/**
 * Merge two object types, combining properties.
 * Properties present in only one object are marked as optional.
 */
function mergeObjectTypes(a: ObjectType, b: ObjectType): ObjectType {
  const properties: Record<string, InferredField> = {};
  const keys = new Set([...Object.keys(a.properties), ...Object.keys(b.properties)]);

  for (const key of keys) {
    const fieldA = a.properties[key];
    const fieldB = b.properties[key];

    if (fieldA && fieldB) {
      properties[key] = {
        type: mergeInferredTypes(fieldA.type, fieldB.type),
        isOptional: fieldA.isOptional || fieldB.isOptional,
      };
    } else if (fieldA) {
      properties[key] = { ...fieldA, isOptional: true };
    } else {
      properties[key] = { ...fieldB!, isOptional: true };
    }
  }

  return { kind: "object", properties };
}

/**
 * Combine two inferred types, creating unions for conflicting scalar types
 * and recursively merging complex types.
 * @param a - First inferred type
 * @param b - Second inferred type
 * @returns Merged type representing both inputs
 */
export function mergeInferredTypes(a: InferredType, b: InferredType): InferredType {
  // If types are identical, return one of them
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return a;
  }

  // Handle merging enums
  if (a.kind === "enum" && b.kind === "enum") {
    const mergedValues = Array.from(new Set([...a.values, ...b.values])).sort();
    return { kind: "enum", values: mergedValues } satisfies EnumType;
  }

  // If one is a union, add the other to its variants
  if (a.kind === "union") {
    // Avoid adding duplicates to the union
    if (!a.variants.some(variant => JSON.stringify(variant) === JSON.stringify(b))) {
      return { kind: "union", variants: [...a.variants, b] };
    }
    return a;
  }
  if (b.kind === "union") {
    // Avoid adding duplicates to the union
    if (!b.variants.some(variant => JSON.stringify(variant) === JSON.stringify(a))) {
      return { kind: "union", variants: [a, ...b.variants] };
    }
    return b;
  }

  // If both are objects, merge their properties
  if (a.kind === "object" && b.kind === "object") {
    return mergeObjectTypes(a, b);
  }

  // If both are arrays, merge their element types
  if (a.kind === "array" && b.kind === "array") {
    return {
      kind: "array",
      elementType: mergeInferredTypes(a.elementType, b.elementType),
    };
  }

  // If types are different and not handled above, create a union
  return { kind: "union", variants: [a, b] };
}

/**
 * Recursively set all isOptional flags to false.
 */
function removeOptionality(type: InferredType): InferredType {
  switch (type.kind) {
    case "object": {
      const properties: Record<string, InferredField> = {};
      for (const [key, field] of Object.entries(type.properties)) {
        properties[key] = {
          type: removeOptionality(field.type),
          isOptional: false,
        };
      }
      return { kind: "object", properties };
    }
    case "array":
      return {
        kind: "array",
        elementType: removeOptionality(type.elementType),
      };
    case "union": {
      return {
        kind: "union",
        variants: type.variants.map((v) => removeOptionality(v)),
      };
    }
    case "enum":
      return type;
    default:
      return type;
  }
}

/**
 * Infer a unified type from multiple sample objects.
 * Merges types together, detecting optionality from missing keys.
 * @param samples - Array of sample objects to analyze
 * @param options - Configuration for type inference and merging
 * @returns The merged inferred type representing all samples
 */
export function inferFromSamples(
  samples: readonly unknown[],
  options?: MergeOptions
): InferredType {
  if (samples.length === 0) {
    return { kind: "scalar", type: "null" };
  }

  return samples.slice(1).reduce(
    (acc, sample) => mergeInferredTypes(acc, inferType(sample, options)),
    inferType(samples[0], options)
  );
}
