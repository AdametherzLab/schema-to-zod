import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { main } from "../src/cli.js";

describe("CLI OpenAPI/Swagger Support", () => {
  const tempDir = path.join(process.cwd(), "temp-test-cli");
  
  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("generates TypeScript and Zod from OpenAPI 3.0 document", async () => {
    const openApiDoc = {
      openapi: "3.0.0",
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              id: { type: "integer" },
              email: { type: "string", format: "email" },
              name: { type: "string" }
            },
            required: ["id", "email"]
          },
          Status: {
            type: "string",
            enum: ["active", "inactive"]
          }
        }
      }
    };

    const inputPath = path.join(tempDir, "openapi.json");
    const outputPath = path.join(tempDir, "output.ts");
    fs.writeFileSync(inputPath, JSON.stringify(openApiDoc));

    await main(["node", "cli.js", "--openapi", inputPath, "--out", outputPath]);

    const output = fs.readFileSync(outputPath, "utf-8");
    expect(output).toContain("interface User");
    expect(output).toContain("id: number");
    expect(output).toContain("email: string");
    expect(output).toContain("name?: string");
    expect(output).toContain("const UserSchema");
    expect(output).toContain('z.enum(["active", "inactive"])');
    expect(output).toContain("z.number().int()");
  });

  it("generates output from Swagger 2.0 definitions", async () => {
    const swaggerDoc = {
      swagger: "2.0",
      definitions: {
        Product: {
          type: "object",
          properties: {
            sku: { type: "string" },
            price: { type: "number" },
            inStock: { type: "boolean" }
          },
          required: ["sku"]
        }
      }
    };

    const inputPath = path.join(tempDir, "swagger.json");
    const outputPath = path.join(tempDir, "swagger-output.ts");
    fs.writeFileSync(inputPath, JSON.stringify(swaggerDoc));

    await main(["node", "cli.js", "--openapi", inputPath, "--out", outputPath]);

    const output = fs.readFileSync(outputPath, "utf-8");
    expect(output).toContain("interface Product");
    expect(output).toContain("sku: string");
    expect(output).toContain("price?: number");
    expect(output).toContain("inStock?: boolean");
    expect(output).toContain("const ProductSchema");
  });

  it("handles OpenAPI with $ref resolution", async () => {
    const openApiDoc = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Address: {
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" }
            },
            required: ["street", "city"]
          },
          Person: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: { $ref: "#/components/schemas/Address" }
            },
            required: ["name"]
          }
        }
      }
    };

    const inputPath = path.join(tempDir, "refs.json");
    const outputPath = path.join(tempDir, "refs-output.ts");
    fs.writeFileSync(inputPath, JSON.stringify(openApiDoc));

    await main(["node", "cli.js", "--openapi", inputPath, "--out", outputPath]);

    const output = fs.readFileSync(outputPath, "utf-8");
    expect(output).toContain("interface Address");
    expect(output).toContain("interface Person");
    expect(output).toContain("address?:");
  });

  it("respects --no-interface and --no-zod flags for OpenAPI", async () => {
    const openApiDoc = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Simple: {
            type: "object",
            properties: {
              id: { type: "integer" }
            }
          }
        }
      }
    };

    const inputPath = path.join(tempDir, "simple.json");
    const outputPath = path.join(tempDir, "simple-output.ts");
    fs.writeFileSync(inputPath, JSON.stringify(openApiDoc));

    await main(["node", "cli.js", "--openapi", inputPath, "--out", outputPath, "--no-interface"]);

    const output = fs.readFileSync(outputPath, "utf-8");
    expect(output).not.toContain("interface Simple");
    expect(output).toContain("const SimpleSchema");
    expect(output).toContain("z.object");
  });

  it("throws error for multiple OpenAPI files", async () => {
    const openApiDoc = { openapi: "3.0.0", components: {} };
    const inputPath1 = path.join(tempDir, "api1.json");
    const inputPath2 = path.join(tempDir, "api2.json");
    fs.writeFileSync(inputPath1, JSON.stringify(openApiDoc));
    fs.writeFileSync(inputPath2, JSON.stringify(openApiDoc));

    let error: Error | undefined;
    try {
      await main(["node", "cli.js", "--openapi", inputPath1, inputPath2]);
    } catch (e) {
      error = e as Error;
    }
    
    expect(error).toBeDefined();
    expect(error!.message).toContain("Only one OpenAPI file");
  });
});
