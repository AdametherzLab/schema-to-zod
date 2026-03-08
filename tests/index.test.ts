import { describe, it, expect } from "bun:test";
import {
  inferType,
  inferFromSamples,
  mergeInferredTypes,
  generateOutput,
  generateZodSchema,
  type InferredType,
  type InferredObject,
  type InferredUnion,
  type CodegenOptions,
  type InferredEnum,
} from "../src/index.js";

describe("schema-to-zod public API", () => {
  it("inferType identifies ISO date strings, integers, floats, and other scalars", () => {
    const dateResult = inferType("2023-01-15T10:30:00Z");
    expect(dateResult).toEqual({ kind: "scalar", type: "date" });

    const intResult = inferType(42);
    expect(intResult).toEqual({ kind: "scalar", type: "integer" });

    const floatResult = inferType(3.14);
    expect(floatResult).toEqual({ kind: "scalar", type: "float" });

    const stringResult = inferType("hello");
    expect(stringResult).toEqual({ kind: "scalar", type: "string" });

    const boolResult = inferType(true);
    expect(boolResult).toEqual({ kind: "scalar", type: "boolean" });

    const nullResult = inferType(null);
    expect(nullResult).toEqual({ kind: "scalar", type: "null" });
  });

  it("inferFromSamples detects optional fields from missing keys and nullable fields from null values", () => {
    const samples = [
      { id: 1, metadata: null },
      { id: 2, metadata: { active: true }, extra: "value" }
    ];

    const result = inferFromSamples(samples, { treatMissingAsOptional: true }) as InferredObject;

    expect(result.kind).toBe("object");
    expect(result.properties.id.isOptional).toBe(false);
    expect(result.properties.id.type.kind).toBe("scalar"); // Assuming non-nullable
    expect((result.properties.id.type as any).type).toBe("integer");
    expect(result.properties.metadata.type.kind).toBe("union"); // null | object
    expect(result.properties.extra.isOptional).toBe(true);
  });

  it("mergeInferredTypes unions conflicting scalar types into InferredUnion", () => {
    const stringType: InferredType = { kind: "scalar", type: "string" };
    const numberType: InferredType = { kind: "scalar", type: "integer" };

    const merged = mergeInferredTypes(stringType, numberType) as InferredUnion;

    expect(merged.kind).toBe("union");
    expect(merged.variants).toContainEqual({ kind: "scalar", type: "string" });
    expect(merged.variants).toContainEqual({ kind: "scalar", type: "integer" });
  });

  it("generateOutput produces TypeScript interface and Zod schema strings for nested objects", () => {
    const nestedObjectType: InferredType = {
      kind: "object",
      properties: {
        user: {
          type: {
            kind: "object",
            properties: {
              name: { type: { kind: "scalar", type: "string" }, isOptional: false },
              age: { type: { kind: "scalar", type: "integer" }, isOptional: false }
            }
          },
          isOptional: false
        }
      }
    };

    const options: CodegenOptions = {
      interfaceName: "ApiResponse",
      includeExports: true,
      useSemicolons: true,
      indentation: "  "
    };

    const output = generateOutput(nestedObjectType as InferredObject, options);

    expect(output.interfaceString).toContain("interface ApiResponse");
    expect(output.interfaceString).toContain("user:");
    expect(output.schemaString).toContain("z.object");
    expect(output.combinedOutput).toContain(output.interfaceString);
    expect(output.combinedOutput).toContain(output.schemaString);
  });

  it("generateZodSchema produces z.array(...) for array root types", () => {
    const arrayType: InferredType = {
      kind: "array",
      elementType: { kind: "scalar", type: "string" }
    };

    const options: CodegenOptions = {
      interfaceName: "StringArray",
      includeExports: true,
      useSemicolons: true,
      indentation: "  "
    };

    const schema = generateZodSchema(arrayType, options);

    expect(schema).toContain("z.array");
    expect(schema).not.toContain("z.object({})");
  });

  it("inferType infers enum from a string array if enabled", () => {
    const enumValues = ["red", "green", "blue"];
    const result = inferType(enumValues, { inferEnums: true });
    expect(result.kind).toBe("enum");
    expect((result as InferredEnum).values).toEqual(expect.arrayContaining(enumValues));
  });

  it("inferType does not infer enum from a string array if disabled", () => {
    const enumValues = ["red", "green", "blue"];
    const result = inferType(enumValues, { inferEnums: false });
    expect(result.kind).toBe("array");
    expect((result as any).elementType).toEqual({ kind: "scalar", type: "string" });
  });

  it("generateZodSchema produces z.enum(...) for enum types", () => {
    const enumType: InferredType = {
      kind: "enum",
      values: ["small", "medium", "large"]
    };

    const options: CodegenOptions = {
      schemaName: "SizeEnum",
      includeExports: true,
      useSemicolons: true,
      indentation: "  "
    };

    const schema = generateZodSchema(enumType, options);
    expect(schema).toContain("z.enum([\"small\", \"medium\", \"large\"])");
  });
});
