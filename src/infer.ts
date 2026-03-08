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
    case "union":
      return {
        kind: "union",
        variants: type.variants.map(removeOptionality),
      };
    case "enum":
    case "scalar":
      return type;
  }
}

/**
 * Infer types from multiple JSON samples, detecting optionality from missing keys
 * and union-merging type conflicts.
 * @param samples - Array of parsed JSON values
 * @param options - Configuration for merge behavior
 * @returns Inferred type representing all samples
 * @throws {Error} If samples array is empty
 * @example
 * const type = inferFromSamples([{ a: 1 }, { a: 2, b: 3 }]);
 * // Returns object with 'a' required (number), 'b' optional (number)
 */
export function inferFromSamples(samples: readonly unknown[], options?: MergeOptions): InferredType {
  if (samples.length === 0) {
    throw new Error("Cannot infer schema from an empty array of samples.");
  }

  let inferredSchema: InferredType = inferType(samples[0], options);

  for (let i = 1; i < samples.length; i++) {
    const currentInferred = inferType(samples[i], options);
    inferredSchema = mergeInferredTypes(inferredSchema, currentInferred);
  }

  // If detectOptionalityFromMissingKeys is false, all fields should be required.
  if (options?.detectOptionalityFromMissingKeys === false) {
    inferredSchema = removeOptionality(inferredSchema);
  }

  return inferredSchema;
}
