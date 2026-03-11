import * as fs from "fs";
import * as path from "path";
import { inferFromSamples } from "./infer.js";
import { generateInterface, generateZodSchema, generateOutput } from "./codegen.js";
import { fromOpenApiDocument, type OpenApiDocument } from "./openapi.js";
import type { MergeOptions, CodegenOptions, InferredType, ObjectType } from "./types.js";

interface CliOptions {
  readonly files: readonly string[];
  readonly outPath?: string;
  readonly interfaceName: string;
  readonly includeInterface: boolean;
  readonly includeZod: boolean;
  readonly isOpenApi: boolean;
}

/**
 * Parse command line arguments into structured options.
 * @param argv - Process arguments array (typically process.argv)
 * @returns Parsed CLI options
 * @throws {Error} If unknown options provided or missing required values
 */
function parseArgs(argv: readonly string[]): CliOptions {
  const files: string[] = [];
  let outPath: string | undefined;
  let interfaceName = "InferredType";
  let includeInterface = true;
  let includeZod = true;
  let isOpenApi = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const next = argv[++i];
      if (!next) throw new Error("--out requires a file path (e.g., --out schema.ts)");
      outPath = next;
    } else if (arg === "--name") {
      const next = argv[++i];
      if (!next) throw new Error("--name requires a value (e.g., --name ApiResponse)");
      interfaceName = next;
    } else if (arg === "--no-interface") {
      includeInterface = false;
    } else if (arg === "--no-zod") {
      includeZod = false;
    } else if (arg === "--openapi") {
      isOpenApi = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}. Valid options: --out, --name, --no-interface, --no-zod, --openapi`);
    } else {
      files.push(arg);
    }
  }

  if (!includeInterface && !includeZod) {
    throw new Error("Invalid flags: cannot suppress both interface and Zod schema generation");
  }

  return { files: files as readonly string[], outPath, interfaceName, includeInterface, includeZod, isOpenApi };
}

/**
 * Read complete input from stdin until EOF.
 * @returns Promise resolving to stdin contents as string
 * @throws {Error} If stdin read fails
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (err) => reject(new Error(`Stdin read failed: ${err.message}`)));
  });
}

/**
 * Read and parse a JSON file from disk.
 * @param filePath - Relative or absolute path to JSON file
 * @returns Parsed JSON value
 * @throws {Error} If file cannot be read or contains invalid JSON
 */
function readJsonFile(filePath: string): unknown {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, "utf-8");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read file "${filePath}": ${cause}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in "${filePath}": ${cause}`);
  }
}

/**
 * Process an OpenAPI/Swagger document and generate TypeScript/Zod output.
 * @param doc - The OpenAPI document
 * @param options - CLI options for generation
 * @returns Generated code string
 */
function processOpenApiDocument(doc: OpenApiDocument, options: CliOptions): string {
  const schemas = fromOpenApiDocument(doc);
  const outputs: string[] = [];

  for (const [name, inferredType] of Object.entries(schemas)) {
    const codegenOptions: CodegenOptions = {
      interfaceName: name,
      schemaName: `${name}Schema`,
      includeExports: true,
      useSemicolons: true,
      indentation: "  "
    };

    if (inferredType.kind !== "object") {
      if (options.includeInterface) {
        console.error(`Warning: Cannot generate interface for non-object schema "${name}"`);
      }
      if (options.includeZod) {
        outputs.push(generateZodSchema(inferredType, codegenOptions));
      }
    } else {
      if (options.includeInterface && options.includeZod) {
        const result = generateOutput(inferredType.properties, codegenOptions);
        outputs.push(result.combinedOutput);
      } else if (options.includeInterface) {
        outputs.push(generateInterface(inferredType.properties, codegenOptions));
      } else if (options.includeZod) {
        outputs.push(generateZodSchema(inferredType, codegenOptions));
      }
    }
  }

  return outputs.join("\n\n");
}

/**
 * Process JSON sample files and generate TypeScript/Zod output.
 * @param samples - Array of sample data
 * @param options - CLI options for generation
 * @returns Generated code string
 */
function processJsonSamples(samples: readonly unknown[], options: CliOptions): string {
  const mergeOptions: MergeOptions = {
    detectOptionalityFromMissingKeys: true,
    coerceDates: true,
    strictNumberTypes: true
  };

  const inferred: InferredType = inferFromSamples(samples, mergeOptions);

  const codegenOptions: CodegenOptions = {
    interfaceName: options.interfaceName,
    schemaName: `${options.interfaceName}Schema`,
    includeExports: true,
    useSemicolons: true,
    indentation: "  "
  };

  let output = "";

  if (inferred.kind !== "object") {
    if (options.includeInterface) {
      console.error("Warning: Cannot generate interface for non-object root type");
    }
    if (options.includeZod) {
      output = generateZodSchema(inferred, codegenOptions);
    }
  } else {
    if (options.includeInterface && options.includeZod) {
      const result = generateOutput(inferred.properties, codegenOptions);
      output = result.combinedOutput;
    } else if (options.includeInterface) {
      output = generateInterface(inferred.properties, codegenOptions);
    } else if (options.includeZod) {
      const objType: ObjectType = { kind: "object", properties: inferred.properties };
      output = generateZodSchema(objType, codegenOptions);
    }
  }

  return output;
}

/**
 * CLI entry point. Parses arguments, reads input, infers schema, and outputs TypeScript.
 * @param argv - Command line arguments (defaults to process.argv)
 * @returns Promise that resolves when processing completes
 * @throws {Error} On invalid input, file errors, or generation failures
 * @example
 * await main(["node", "cli.js", "data.json", "--out", "schema.ts"]);
 * @example
 * await main(["node", "cli.js", "--openapi", "api.json", "--out", "types.ts"]);
 */
export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const options = parseArgs(argv);

  let output = "";

  if (options.isOpenApi) {
    let doc: OpenApiDocument;
    if (options.files.length === 0) {
      const stdin = await readStdin();
      if (!stdin.trim()) {
        throw new Error("No input provided: specify OpenAPI file path or pipe OpenAPI JSON to stdin");
      }
      try {
        doc = JSON.parse(stdin) as OpenApiDocument;
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON from stdin: ${cause}`);
      }
    } else {
      if (options.files.length > 1) {
        throw new Error("Only one OpenAPI file can be processed at a time");
      }
      doc = readJsonFile(options.files[0]) as OpenApiDocument;
    }
    output = processOpenApiDocument(doc, options);
  } else {
    let samples: readonly unknown[];
    if (options.files.length === 0) {
      const stdin = await readStdin();
      if (!stdin.trim()) {
        throw new Error("No input provided: specify JSON file paths or pipe JSON data to stdin");
      }
      try {
        const parsed = JSON.parse(stdin);
        samples = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON from stdin: ${cause}`);
      }
    } else {
      samples = options.files.map(readJsonFile);
    }
    output = processJsonSamples(samples, options);
  }

  if (options.outPath) {
    const outPath = path.isAbsolute(options.outPath)
      ? options.outPath
      : path.join(process.cwd(), options.outPath);
    try {
      fs.writeFileSync(outPath, output, "utf-8");
      console.error(`Generated TypeScript written to: ${outPath}`);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write output to "${options.outPath}": ${cause}`);
    }
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
