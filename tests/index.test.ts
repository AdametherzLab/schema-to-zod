import { describe, it, expect } from "bun:test";
// REMOVED: broken import — none of {inferType,
  inferFromSamples,
  mergeInferredTypes,
  generateOutput,
  generateZodSchema,
  type InferredType,
  type InferredObject,
  type InferredUnion,
  type CodegenOptions} exist in index.ts;

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
    expect(result.fields.id.optional).toBe(false);
    expect(result.fields.id.nullable).toBe(false);
    expect(result.fields.metadata.nullable).toBe(true);
    expect(result.fields.extra.optional).toBe(true);
  });

  it("mergeInferredTypes unions conflicting scalar types into InferredUnion", () => {
    const stringType: InferredType = { kind: "scalar", type: "string" };
    const numberType: InferredType = { kind: "scalar", type: "integer" };

    const merged = mergeInferredTypes(stringType, numberType) as InferredUnion;

    expect(merged.kind).toBe("union");
    expect(merged.types).toContainEqual({ kind: "scalar", type: "string" });
    expect(merged.types).toContainEqual({ kind: "scalar", type: "integer" });
  });

  it("generateOutput produces TypeScript interface and Zod schema strings for nested objects", () => {
    const nestedObjectType: InferredType = {
      kind: "object",
      fields: {
        user: {
          type: {
            kind: "object",
            fields: {
              name: { type: { kind: "scalar", type: "string" }, optional: false, nullable: false },
              age: { type: { kind: "scalar", type: "integer" }, optional: false, nullable: false }
            }
          },
          optional: false,
          nullable: false
        }
      }
    };

    const options: CodegenOptions = {
      rootName: "ApiResponse",
      export: true,
      includeInterface: true,
      includeZod: true,
      indentSize: 2
    };

    const output = generateOutput(nestedObjectType, options);

    expect(output.interface).toContain("interface ApiResponse");
    expect(output.interface).toContain("user:");
    expect(output.zodSchema).toContain("z.object");
    expect(output.combined).toContain(output.interface);
    expect(output.combined).toContain(output.zodSchema);
  });

  it("generateZodSchema produces z.array(...) for array root types", () => {
    const arrayType: InferredType = {
      kind: "array",
      items: { kind: "scalar", type: "string" }
    };

    const options: CodegenOptions = {
      rootName: "StringArray",
      export: true,
      includeInterface: true,
      includeZod: true,
      indentSize: 2
    };

    const schema = generateZodSchema(arrayType, options);

    expect(schema).toContain("z.array");
    expect(schema).not.toContain("z.object({})");
  });
});