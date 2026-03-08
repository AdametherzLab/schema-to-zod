/**
 * Core type system for the schema-to-zod inference engine.
 * Defines all possible type shapes and configuration options for the inference pipeline.
 */

/** Discriminated union representing all possible inferred type shapes. */
export type InferredType =
  | StringType
  | NumberType
  | IntegerType
  | FloatType
  | BooleanType
  | NullType
  | DateType
  | ObjectType
  | ArrayType
  | UnionType;

/** String scalar type with optional format detection. */
export interface StringType {
  readonly kind: "string";
  /** Detected format hint for validation (e.g., ISO 8601 dates). */
  readonly format?: "datetime" | "email" | "uuid" | "url";
}

/** Generic number type when integer vs float distinction is unclear. */
export interface NumberType {
  readonly kind: "number";
}

/** Integer type for whole numbers. */
export interface IntegerType {
  readonly kind: "integer";
}

/** Float type for decimal numbers. */
export interface FloatType {
  readonly kind: "float";
}

/** Boolean type. */
export interface BooleanType {
  readonly kind: "boolean";
}

/** Null type representing explicit null values. */
export interface NullType {
  readonly kind: "null";
}

/** Date type representing ISO 8601 date strings. */
export interface DateType {
  readonly kind: "date";
}

/** Object type with mapped property definitions. */
export interface ObjectType {
  readonly kind: "object";
  readonly properties: InferredObject;
}

/** Array type with inferred element type. */
export interface ArrayType {
  readonly kind: "array";
  /** The type of array elements (homogeneous arrays only). */
  readonly elementType: InferredType;
}

/** Union type representing multiple possible types for a field. */
export interface UnionType {
  readonly kind: "union";
  /** All possible type variants in this union. */
  readonly variants: readonly InferredType[];
}

/** Field metadata capturing the inferred type and optionality status. */
export interface InferredField {
  /** The inferred type shape for this field. */
  readonly type: InferredType;
  /** 
   * Whether the field is optional (undefined or null in some samples).
   * True if the key is missing in some objects or contains null values.
   */
  readonly isOptional: boolean;
}

/** Map of property names to their inferred field definitions. */
export type InferredObject = Readonly<Record<string, InferredField>>;

/** Configuration options for merging multiple sample schemas. */
export interface MergeOptions {
  /** 
   * Detect optionality when a key exists in some samples but is missing in others.
   * @default true
   */
  readonly detectOptionalityFromMissingKeys?: boolean;
  /** 
   * Convert ISO 8601 date strings to datetime format instead of plain strings.
   * @default true
   */
  readonly coerceDates?: boolean;
  /** 
   * Distinguish between integer and float types; otherwise coerces to generic number.
   * @default true
   */
  readonly strictNumberTypes?: boolean;
}

/** Configuration options for code generation output formatting. */
export interface CodegenOptions {
  /** 
   * Name for the generated TypeScript interface.
   * @default "InferredType"
   */
  readonly interfaceName?: string;
  /** 
   * Name for the generated Zod schema variable.
   * @default "inferredSchema"
   */
  readonly schemaName?: string;
  /** 
   * Include export keyword in generated interface and schema declarations.
   * @default true
   */
  readonly includeExports?: boolean;
  /** 
   * Append semicolons to generated TypeScript property declarations.
   * @default true
   */
  readonly useSemicolons?: boolean;
  /** 
   * Indentation string for nested structures (e.g., "  " for two spaces, "\t" for tabs).
   * @default "  "
   */
  readonly indentation?: string;
}