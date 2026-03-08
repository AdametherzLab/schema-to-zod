import type {
  InferredType,
  InferredObject,
  InferredField,
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
  CodegenOptions,
} from "./types.js";

/** Output container for generated TypeScript and Zod code. */
export interface GeneratedOutput {
  /** The generated TypeScript interface declaration. */
  readonly interfaceString: string;
  /** The generated Zod schema declaration. */
  readonly schemaString: string;
  /** Both declarations combined with a newline separator. */
  readonly combinedOutput: string;
}

const DEFAULT_OPTIONS = {
  interfaceName: "InferredType",
  schemaName: "inferredSchema",
  includeExports: true,
  useSemicolons: true,
  indentation: "  ",
} satisfies Required<CodegenOptions>;

function resolveOptions(options?: CodegenOptions): Required<CodegenOptions> {
  return { ...DEFAULT_OPTIONS, ...options };
}

// Type guards
const isStringType = (t: InferredType): t is StringType => t.kind === "string";
const isNumberType = (t: InferredType): t is NumberType => t.kind === "number";
const isIntegerType = (t: InferredType): t is IntegerType => t.kind === "integer";
const isFloatType = (t: InferredType): t is FloatType => t.kind === "float";
const isBooleanType = (t: InferredType): t is BooleanType => t.kind === "boolean";
const isNullType = (t: InferredType): t is NullType => t.kind === "null";
const isDateType = (t: InferredType): t is DateType => t.kind === "date";
const isObjectType = (t: InferredType): t is ObjectType => t.kind === "object";
const isArrayType = (t: InferredType): t is ArrayType => t.kind === "array";
const isUnionType = (t: InferredType): t is UnionType => t.kind === "union";

function generateTypeScriptType(type: InferredType, indent: string, useSemicolons: boolean): string {
  if (isStringType(type) || isDateType(type)) return "string";
  if (isNumberType(type) || isIntegerType(type) || isFloatType(type)) return "number";
  if (isBooleanType(type)) return "boolean";
  if (isNullType(type)) return "null";
  if (isObjectType(type)) return generateObjectTypeString(type.properties, indent, useSemicolons);
  if (isArrayType(type)) {
    const element = generateTypeScriptType(type.elementType, indent, useSemicolons);
    return `Array<${element}>`;
  }
  if (isUnionType(type)) {
    return type.variants.map(v => generateTypeScriptType(v, indent, useSemicolons)).join(" | ");
  }
  return "unknown";
}

function generateObjectTypeString(obj: InferredObject, indent: string, useSemicolons: boolean): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "{}";
  
  const nextIndent = indent + "  ";
  const terminator = useSemicolons ? ";" : "";
  const lines = entries.map(([key, field]) => {
    const optional = field.isOptional ? "?" : "";
    const typeStr = generateTypeScriptType(field.type, nextIndent, useSemicolons);
    return `${nextIndent}${key}${optional}: ${typeStr}${terminator}`;
  });
  
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * Generate a TypeScript interface declaration from an inferred object structure.
 * @param inferredObject - The object structure to convert
 * @param options - Code generation options
 * @returns Formatted TypeScript interface string
 * @example
 * const output = generateInterface(inferredObj, { interfaceName: "User" });
 */
export function generateInterface(inferredObject: InferredObject, options?: CodegenOptions): string {
  const opts = resolveOptions(options);
  const exportKw = opts.includeExports ? "export " : "";
  const body = generateObjectTypeString(inferredObject, opts.indentation, opts.useSemicolons);
  return `${exportKw}interface ${opts.interfaceName} ${body}`;
}

function generateZodSchemaType(type: InferredType, indent: string): string {
  if (isStringType(type)) {
    if (type.format === "datetime") return "z.string().datetime()";
    if (type.format === "email") return "z.string().email()";
    if (type.format === "uuid") return "z.string().uuid()";
    if (type.format === "url") return "z.string().url()";
    return "z.string()";
  }
  if (isIntegerType(type)) return "z.number().int()";
  if (isFloatType(type) || isNumberType(type)) return "z.number()";
  if (isBooleanType(type)) return "z.boolean()";
  if (isNullType(type)) return "z.null()";
  if (isDateType(type)) return "z.string().datetime()";
  if (isObjectType(type)) return generateZodObjectString(type.properties, indent);
  if (isArrayType(type)) {
    const element = generateZodSchemaType(type.elementType, indent);
    return `z.array(${element})`;
  }
  if (isUnionType(type)) {
    const variants = type.variants.map(v => generateZodSchemaType(v, indent));
    return `z.union([${variants.join(", ")}])`;
  }
  return "z.unknown()";
}

function generateZodObjectString(obj: InferredObject, indent: string): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "z.object({})";
  
  const nextIndent = indent + "  ";
  const lines = entries.map(([key, field]) => {
    let schema = generateZodSchemaType(field.type, nextIndent);
    if (field.isOptional) schema += ".optional()";
    return `${nextIndent}${key}: ${schema}`;
  });
  
  return `z.object({\n${lines.join(",\n")}\n${indent}})`;
}

/**
 * Generate a Zod schema declaration from an inferred type.
 * @param inferredType - The type to convert to a Zod schema
 * @param options - Code generation options
 * @returns Zod schema declaration string (e.g., "export const schema = z.object({...});")
 * @example
 * const schema = generateZodSchema(inferredType, { schemaName: "userSchema" });
 */
export function generateZodSchema(inferredType: InferredType, options?: CodegenOptions): string {
  const opts = resolveOptions(options);
  const exportKw = opts.includeExports ? "export " : "";
  const body = generateZodSchemaType(inferredType, opts.indentation);
  return `${exportKw}const ${opts.schemaName} = ${body};`;
}

/**
 * Generate both TypeScript interface and Zod schema from an inferred object structure.
 * @param inferredObject - The object structure to convert
 * @param options - Code generation options
 * @returns Object containing interface, schema, and combined output strings
 * @example
 * const result = generateOutput(inferredObj, { interfaceName: "ApiResponse" });
 * fs.writeFileSync("schema.ts", result.combinedOutput);
 */
export function generateOutput(inferredObject: InferredObject, options?: CodegenOptions): GeneratedOutput {
  const objectType: ObjectType = { kind: "object", properties: inferredObject };
  const interfaceStr = generateInterface(inferredObject, options);
  const schemaStr = generateZodSchema(objectType, options);
  
  return {
    interfaceString: interfaceStr,
    schemaString: schemaStr,
    combinedOutput: `${interfaceStr}\n\n${schemaStr}`,
  };
}