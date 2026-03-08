[![CI](https://github.com/AdametherzLab/schema-to-zod/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/schema-to-zod/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# schema-to-zod 🔮

Stop hand-rolling Zod schemas from JSON samples. Point this CLI at any JSON file and get production-ready TypeScript types plus matching validation schemas instantly. No more drift between your API responses and your type definitions.

## Features

- ✅ **Zero-config inference** — Drop a JSON file, get a TypeScript interface and Zod schema
- ✅ **Smart optionality detection** — Feed it multiple samples to detect which fields are optional vs required
- ✅ **Type coercion magic** — ISO dates become `z.string().datetime()`, integers stay integers, floats stay floats
- ✅ **Nested object support** — Deeply nested structures, arrays, and unions handled automatically
- ✅ **CLI + Programmatic** — Use it in your build pipeline or import it as a library

## Installation

```bash
npm install @adametherzlab/schema-to-zod
# or
bun add @adametherzlab/schema-to-zod
```

## Quick Start

```bash
npx @adametherzlab/schema-to-zod response.json --out schema.ts
```

Or use it programmatically:

```typescript
// REMOVED external import: import { inferFromSamples, generateOutput } from "@adametherzlab/schema-to-zod";

const samples = [{ id: 1 }, { id: 2, name: "Ada" }];
const result = generateOutput(inferFromSamples(samples), { interfaceName: "User" });
console.log(result.combinedOutput);
```

## CLI Usage 🛠️

```bash
# Single file
schema-to-zod data.json

# Multiple files for better optionality detection
schema-to-zod sample1.json sample2.json sample3.json

# Output to file instead of stdout
schema-to-zod api-response.json --out types.ts

# Custom names for generated types
schema-to-zod user.json --name UserAccount --schemaName userSchema

# Pipe from stdin
cat response.json | schema-to-zod --name ApiResponse
```

## Type Inference Rules 🧠

- **ISO Dates**: Strings matching ISO 8601 (e.g., `2024-01-15T10:30:00Z`) → `z.string().datetime()`
- **Integers vs Floats**: `42` → `z.number().int()`, `3.14` → `z.number()`
- **Optionality**: Fields missing in some samples become optional properties (`field?: type`)
- **Nullability**: Explicit `null` values create union types (`field: string | null`)
- **Union Types**: Conflicting scalar types across samples become unions (`string | number`)

## Worked Example 📝

**Input** (`user.json`):
```json
{
  "id": 123,
  "email": "ada@example.com",
  "createdAt": "2024-01-15T10:30:00Z",
  "score": 98.5,
  "tags": ["admin", "beta"],
  "metadata": null
}
```

**Generated TypeScript**:
```typescript
export interface User {
  id: number;
  email: string;
  createdAt: string;
  score: number;
  tags: string[];
  metadata?: unknown;
}
```

**Generated Zod Schema**:
```typescript
// REMOVED external import: import { z } from "zod";

export const userSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  createdAt: z.string().datetime(),
  score: z.number(),
  tags: z.array(z.string()),
  metadata: z.optional(z.unknown())
});
```

## API Reference

### `inferType(value, options?)`
- **Param** `value`: `unknown` — Any JSON value (primitive, object, or array)
- **Param** `options`: `MergeOptions` (optional) — Configuration for type inference
- **Returns**: `InferredType` — The inferred type structure
- **Throws**: `TypeError` for unsupported value types (undefined, function, symbol, bigint)
- **Example**: `const type = inferType({ name: "John", age: 30 });`

### `mergeInferredTypes(a, b)`
Combine two inferred types, creating unions for conflicting scalar types and recursively merging complex types.
- **Param** `a`: `InferredType` — First inferred type
- **Param** `b`: `InferredType` — Second inferred type
- **Returns**: `InferredType` — Merged type representing both inputs
- **Example**: `const merged = mergeInferredTypes(typeA, typeB);`

### `inferFromSamples(samples, options?)`
- **Param** `samples`: `readonly unknown[]` — Array of parsed JSON values
- **Param** `options`: `MergeOptions` (optional) — Configuration for merge behavior
- **Returns**: `InferredType` — Inferred type representing all samples
- **Throws**: `Error` if samples array is empty
- **Example**: `const type = inferFromSamples([{ a: 1 }, { a: 2, b: 3 }]);`

### `generateInterface(inferredObject, options?)`
- **Param** `inferredObject`: `InferredObject` — The object structure to convert
- **Param** `options`: `CodegenOptions` (optional) — Code generation options
- **Returns**: `string` — Formatted TypeScript interface string
- **Example**: `const output = generateInterface(inferredObj, { interfaceName: "User" });`

### `generateZodSchema(inferredType, options?)`
- **Param** `inferredType`: `InferredType` — The type to convert to a Zod schema
- **Param** `options`: `CodegenOptions` (optional) — Code generation options
- **Returns**: `string` — Zod schema declaration string (e.g., `"export const schema = z.object({...});"`)
- **Example**: `const schema = generateZodSchema(inferredType, { schemaName: "userSchema" });`

### `generateOutput(inferredObject, options?)`
- **Param** `inferredObject`: `InferredObject` — The object structure to convert
- **Param** `options`: `CodegenOptions` (optional) — Code generation options
- **Returns**: `GeneratedOutput` — Object containing interface, schema, and combined output strings
- **Example**: `const result = generateOutput(inferredObj, { interfaceName: "ApiResponse" });`

### `main(argv?)`
CLI entry point. Parses arguments, reads input, infers schema, and outputs TypeScript.
- **Param** `argv`: `readonly string[]` (optional, defaults to `process.argv`) — Command line arguments
- **Returns**: `Promise<void>` — Promise that resolves when processing completes
- **Throws**: `Error` on invalid input, file errors, or generation failures
- **Example**: `await main(["node", "cli.js", "data.json", "--out", "schema.ts"]);`

## Advanced Usage

```typescript
import * as fs from "fs";
import * as path from "path";
// REMOVED external import: import { inferFromSamples, generateOutput, InferredObject } from "@adametherzlab/schema-to-zod";

// Collect samples from different API versions
const sampleDir = path.join(process.cwd(), "api-samples");
const files = fs.readdirSync(sampleDir).filter(f => f.endsWith(".json"));

const samples = files.map(f => 
  JSON.parse(fs.readFileSync(path.join(sampleDir, f), "utf-8"))
);

// Infer with optionality detection across all samples
const inferred = inferFromSamples(samples) as InferredObject;

// Generate production-ready output
const { combinedOutput } = generateOutput(inferred, {
  interfaceName: "ApiResponse",
  schemaName: "apiResponseSchema",
  includeZodImport: true
});

fs.writeFileSync(path.join("src", "types", "api.ts"), combinedOutput);
console.log(`✅ Generated types from ${files.length} samples`);
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT (c) [AdametherzLab](https://github.com/AdametherzLab)