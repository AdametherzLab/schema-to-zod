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
  EnumType,
  ScalarType,
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
const isScalarType = (t: InferredType): t is ScalarType => t.kind === "scalar";
const isStringType = (t: InferredType): t is StringType => isScalarType(t) && t.type === "string";
const isNumberType = (t: InferredType): t is NumberType => isScalarType(t) && t.type === "number";
const isIntegerType = (t: InferredType): t is IntegerType => isScalarType(t) && t.type === "integer";
const isFloatType = (t: InferredType): t is FloatType => isScalarType(t) && t.type === "float";
const isBooleanType = (t: InferredType): t is BooleanType => isScalarType(t) && t.type === "boolean";
const isNullType = (t: InferredType): t is NullType => isScalarType(t) && t.type === "null";
const isDateType = (t: InferredType): t is DateType => isScalarType(t) && t.type === "date";
const isObjectType = (t: InferredType): t is ObjectType => t.kind === "object";
const isArrayType = (t: InferredType): t is ArrayType => t.kind === "array";
const isUnionType = (t: InferredType): t is UnionType => t.kind === "union";
const isEnumType = (t: InferredType): t is EnumType => t.kind === "enum";

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
  if (isEnumType(type)) {
    return type.values.map(v => `'${v}'`).join(" | ");
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
  
  return `{
${lines.join("\n")}
${indent}}`;
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
  if (isEnumType(type)) {
    const values = type.values.map(v => JSON.stringify(v)).join(", ");
    return `z.enum([${values}])`;
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
  
  return `z.object({
${lines.join(",\n")}
${indent}})`;
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
