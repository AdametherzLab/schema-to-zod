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
  MergeOptions
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
    return { kind: "null" } satisfies NullType;
  }

  if (typeof value === "boolean") {
    return { kind: "boolean" } satisfies BooleanType;
  }

  if (typeof value === "number") {
    if (options?.strictNumberTypes === false) {
      return { kind: "number" } satisfies NumberType;
    }
    return Number.isInteger(value)
      ? ({ kind: "integer" } satisfies IntegerType)
      : ({ kind: "float" } satisfies FloatType);
  }

  if (typeof value === "string") {
    if (options?.coerceDates !== false && isIso8601Date(value)) {
      return { kind: "date" } satisfies DateType;
    }
    return { kind: "string" } satisfies StringType;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        kind: "array",
        elementType: { kind: "null" },
      } satisfies ArrayType;
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
  if (a.kind === b.kind) {
    switch (a.kind) {
      case "object":
        return mergeObjectTypes(a, b);
      case "array":
        return {
          kind: "array",
          elementType: mergeInferredTypes(a.elementType, b.elementType),
        };
      case "union":
        return {
          kind: "union",
          variants: [...a.variants, ...b.variants],
        };
      default:
        return a;
    }
  }

  if (a.kind === "union") {
    return { kind: "union", variants: [...a.variants, b] };
  }
  if (b.kind === "union") {
    return { kind: "union", variants: [a, ...b.variants] };
  }

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
    default:
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
    throw new Error("At least one sample is required for type inference");
  }

  const merged = samples.slice(1).reduce(
    (acc, sample) => mergeInferredTypes(acc, inferType(sample, options)),
    inferType(samples[0], options)
  );

  if (options?.detectOptionalityFromMissingKeys === false) {
    return removeOptionality(merged);
  }

  return merged;
}