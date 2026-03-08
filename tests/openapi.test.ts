import { describe, it, expect } from "bun:test";
import {
  fromOpenApiSchema,
  fromOpenApiDocument,
  generateZodSchema,
  generateOutput,
  type OpenApiSchema,
  type OpenApiDocument,
  type InferredType,
} from "../src/index.js";

describe("OpenAPI schema conversion", () => {
  it("converts primitive types correctly", () => {
    expect(fromOpenApiSchema({ type: "string" }))
      .toEqual({ kind: "scalar", type: "string" });

    expect(fromOpenApiSchema({ type: "integer" }))
      .toEqual({ kind: "scalar", type: "integer" });

    expect(fromOpenApiSchema({ type: "number" }))
      .toEqual({ kind: "scalar", type: "float" });

    expect(fromOpenApiSchema({ type: "boolean" }))
      .toEqual({ kind: "scalar", type: "boolean" });

    expect(fromOpenApiSchema({ type: "number", format: "int64" }))
      .toEqual({ kind: "scalar", type: "integer" });
  });

  it("converts string formats (date-time, email, uuid, uri)", () => {
    expect(fromOpenApiSchema({ type: "string", format: "date-time" }))
      .toEqual({ kind: "scalar", type: "date" });

    expect(fromOpenApiSchema({ type: "string", format: "email" }))
      .toEqual({ kind: "scalar", type: "string", format: "email" });

    expect(fromOpenApiSchema({ type: "string", format: "uuid" }))
      .toEqual({ kind: "scalar", type: "string", format: "uuid" });

    expect(fromOpenApiSchema({ type: "string", format: "uri" }))
      .toEqual({ kind: "scalar", type: "string", format: "url" });
  });

  it("respects coerceDates: false option", () => {
    const result = fromOpenApiSchema(
      { type: "string", format: "date-time" },
      undefined,
      { coerceDates: false },
    );
    expect(result).toEqual({ kind: "scalar", type: "string" });
  });

  it("converts object schemas with required/optional fields", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        bio: { type: "string" },
      },
      required: ["id", "name"],
    };

    const result = fromOpenApiSchema(schema);
    expect(result.kind).toBe("object");
    if (result.kind !== "object") throw new Error("Expected object");

    expect(result.properties.id.isOptional).toBe(false);
    expect(result.properties.id.type).toEqual({ kind: "scalar", type: "integer" });
    expect(result.properties.name.isOptional).toBe(false);
    expect(result.properties.bio.isOptional).toBe(true);
  });

  it("converts array schemas", () => {
    const schema: OpenApiSchema = {
      type: "array",
      items: { type: "string" },
    };

    const result = fromOpenApiSchema(schema);
    expect(result).toEqual({
      kind: "array",
      elementType: { kind: "scalar", type: "string" },
    });
  });

  it("converts enum schemas", () => {
    const schema: OpenApiSchema = {
      type: "string",
      enum: ["active", "inactive", "pending"],
    };

    const result = fromOpenApiSchema(schema);
    expect(result).toEqual({
      kind: "enum",
      values: ["active", "inactive", "pending"],
    });
  });

  it("handles nullable types", () => {
    const schema: OpenApiSchema = {
      type: "string",
      nullable: true,
    };

    const result = fromOpenApiSchema(schema);
    expect(result.kind).toBe("union");
    if (result.kind !== "union") throw new Error("Expected union");
    expect(result.variants).toContainEqual({ kind: "scalar", type: "string" });
    expect(result.variants).toContainEqual({ kind: "scalar", type: "null" });
  });

  it("handles oneOf/anyOf as union types", () => {
    const schema: OpenApiSchema = {
      oneOf: [
        { type: "string" },
        { type: "integer" },
      ],
    };

    const result = fromOpenApiSchema(schema);
    expect(result.kind).toBe("union");
    if (result.kind !== "union") throw new Error("Expected union");
    expect(result.variants).toEqual([
      { kind: "scalar", type: "string" },
      { kind: "scalar", type: "integer" },
    ]);
  });

  it("handles allOf by merging object properties", () => {
    const schema: OpenApiSchema = {
      allOf: [
        {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      ],
    };

    const result = fromOpenApiSchema(schema);
    expect(result.kind).toBe("object");
    if (result.kind !== "object") throw new Error("Expected object");
    expect(result.properties.id.type).toEqual({ kind: "scalar", type: "integer" });
    expect(result.properties.name.type).toEqual({ kind: "scalar", type: "string" });
  });

  it("resolves $ref pointers within a document", () => {
    const doc: OpenApiDocument = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Address: {
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" },
            },
            required: ["street", "city"],
          },
          User: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: { $ref: "#/components/schemas/Address" },
            },
            required: ["name", "address"],
          },
        },
      },
    };

    const userSchema = doc.components!.schemas!["User"];
    const result = fromOpenApiSchema(userSchema, doc);
    expect(result.kind).toBe("object");
    if (result.kind !== "object") throw new Error("Expected object");

    expect(result.properties.name.type).toEqual({ kind: "scalar", type: "string" });
    expect(result.properties.address.type.kind).toBe("object");
    if (result.properties.address.type.kind !== "object") throw new Error("Expected object");
    expect(result.properties.address.type.properties.street.type)
      .toEqual({ kind: "scalar", type: "string" });
  });

  it("fromOpenApiDocument extracts all schemas from OpenAPI 3.x", () => {
    const doc: OpenApiDocument = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Pet: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer" },
            },
            required: ["name"],
          },
          Error: {
            type: "object",
            properties: {
              code: { type: "integer" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
      },
    };

    const schemas = fromOpenApiDocument(doc);
    expect(Object.keys(schemas)).toEqual(["Pet", "Error"]);
    expect(schemas.Pet.kind).toBe("object");
    expect(schemas.Error.kind).toBe("object");
  });

  it("fromOpenApiDocument supports Swagger 2.x definitions", () => {
    const doc: OpenApiDocument = {
      swagger: "2.0",
      definitions: {
        Item: {
          type: "object",
          properties: {
            id: { type: "integer" },
            label: { type: "string" },
          },
          required: ["id"],
        },
      },
    };

    const schemas = fromOpenApiDocument(doc);
    expect(Object.keys(schemas)).toEqual(["Item"]);
    if (schemas.Item.kind !== "object") throw new Error("Expected object");
    expect(schemas.Item.properties.id.isOptional).toBe(false);
    expect(schemas.Item.properties.label.isOptional).toBe(true);
  });

  it("generates Zod schema from converted OpenAPI schema", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["admin", "user"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id", "email", "role"],
    };

    const inferred = fromOpenApiSchema(schema);
    const zodCode = generateZodSchema(inferred, { schemaName: "UserSchema" });

    expect(zodCode).toContain("z.number().int()");
    expect(zodCode).toContain("z.string().email()");
    expect(zodCode).toContain('z.enum(["admin", "user"])');
    expect(zodCode).toContain("z.array(z.string())");
    expect(zodCode).toContain(".optional()");
  });

  it("generates TypeScript interface from converted OpenAPI schema", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        score: { type: "number" },
      },
      required: ["name"],
    };

    const inferred = fromOpenApiSchema(schema);
    if (inferred.kind !== "object") throw new Error("Expected object");
    const output = generateOutput(inferred, { interfaceName: "Player" });

    expect(output.interfaceString).toContain("interface Player");
    expect(output.interfaceString).toContain("name: string");
    expect(output.interfaceString).toContain("score?: number");
    expect(output.schemaString).toContain("z.object");
  });

  it("handles deeply nested OpenAPI schemas", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  meta: {
                    type: "object",
                    properties: {
                      createdAt: { type: "string", format: "date-time" },
                    },
                  },
                },
                required: ["id"],
              },
            },
          },
        },
      },
      required: ["data"],
    };

    const result = fromOpenApiSchema(schema);
    expect(result.kind).toBe("object");
    if (result.kind !== "object") throw new Error("Expected object");
    const dataType = result.properties.data.type;
    expect(dataType.kind).toBe("object");
  });

  it("throws on unresolvable $ref without document", () => {
    expect(() => fromOpenApiSchema({ $ref: "#/components/schemas/Missing" }))
      .toThrow("Cannot resolve $ref without a root document");
  });

  it("throws on external $ref", () => {
    const doc: OpenApiDocument = { openapi: "3.0.0" };
    expect(() => fromOpenApiSchema({ $ref: "https://example.com/schema.json" }, doc))
      .toThrow("External $ref not supported");
  });
});
