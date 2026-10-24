import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "touch-os-package-"));
const packDirectory = join(temporaryRoot, "pack");
const consumerDirectory = join(temporaryRoot, "consumer");
const usageFixtureFilename = "usage-conformance.ts";

const nonThreeEntrypoints = [
  "@found-in-space/touch-os",
  "@found-in-space/touch-os/core",
  "@found-in-space/touch-os/components",
  "@found-in-space/touch-os/containers",
  "@found-in-space/touch-os/services",
  "@found-in-space/touch-os/coordination",
  "@found-in-space/touch-os/interaction",
  "@found-in-space/touch-os/apps",
  "@found-in-space/touch-os/app-shell",
  "@found-in-space/touch-os/window-manager",
  "@found-in-space/touch-os/hosts",
  "@found-in-space/touch-os/adapters/schema"
];
const threeEntrypoint = "@found-in-space/touch-os/hosts/three";

try {
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(consumerDirectory, { recursive: true });

  const packResponse = JSON.parse(run("npm", [
    "pack",
    "--json",
    "--pack-destination",
    packDirectory
  ], repositoryRoot));
  const packResult = Array.isArray(packResponse) ? packResponse : Object.values(packResponse);
  const packedFilename = packResult[0]?.filename;
  if (typeof packedFilename !== "string") {
    throw new Error("npm pack did not report a packed filename.");
  }

  const tarballPath = join(packDirectory, packedFilename);
  const packedFiles = new Set(
    (packResult[0]?.files ?? []).map((entry) => entry.path)
  );
  if ([...packedFiles].some((path) => path.startsWith("dist/examples/"))) {
    throw new Error("The packed package contains source-only reference fixture output.");
  }

  writeFileSync(join(consumerDirectory, "package.json"), JSON.stringify({
    name: "touch-os-packed-consumer",
    private: true,
    type: "module"
  }, null, 2));

  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--omit=optional",
    tarballPath
  ], consumerDirectory);

  writeFileSync(
    join(consumerDirectory, "non-three.mjs"),
    `${nonThreeEntrypoints.map((entrypoint, index) =>
      `import * as entry${index} from ${JSON.stringify(entrypoint)};`
    ).join("\n")}\n` +
      `const entries = [${nonThreeEntrypoints.map((_, index) => `entry${index}`).join(", ")}];\n` +
      `if (globalThis.pointerEventspointerMap !== undefined) throw new Error("Headless imports loaded pointer-events.");\n` +
      `if (entries.some((entry) => typeof entry !== "object")) throw new Error("Invalid ESM entrypoint.");\n`
  );
  run(process.execPath, ["non-three.mjs"], consumerDirectory);

  const consumerThreePath = join(consumerDirectory, "node_modules", "three");
  const pointerPath = join(consumerDirectory, "node_modules", "@pmndrs", "pointer-events");
  mkdirSync(dirname(pointerPath), { recursive: true });
  symlinkDirectory(join(repositoryRoot, "node_modules", "@pmndrs", "pointer-events"), pointerPath);
  const consumerTypesPath = join(consumerDirectory, "node_modules", "@types", "three");
  mkdirSync(dirname(consumerTypesPath), { recursive: true });
  symlinkDirectory(join(repositoryRoot, "node_modules", "three"), consumerThreePath);
  symlinkDirectory(join(repositoryRoot, "node_modules", "@types", "three"), consumerTypesPath);

  writeFileSync(
    join(consumerDirectory, "three.mjs"),
    `import * as threeHost from ${JSON.stringify(threeEntrypoint)};\n` +
      `if (typeof threeHost.createScenePanelHost !== "function") throw new Error("Invalid Three host entrypoint.");\n`
  );
  run(process.execPath, ["three.mjs"], consumerDirectory);

  const allEntrypoints = [...nonThreeEntrypoints, threeEntrypoint];
  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    `${allEntrypoints.map((entrypoint, index) =>
      `import * as entry${index} from ${JSON.stringify(entrypoint)};`
    ).join("\n")}\n` +
      `export const resolvedEntrypoints = [${allEntrypoints.map((_, index) => `entry${index}`).join(", ")}];\n`
  );
  copyFileSync(
    join(repositoryRoot, "scripts", "fixtures", usageFixtureFilename),
    join(consumerDirectory, usageFixtureFilename)
  );
  writeFileSync(join(consumerDirectory, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM"],
      strict: true,
      noEmit: true,
      // Match the package's supported consumer setup and avoid external @types/three WebGPU globals.
      skipLibCheck: true
    },
    include: ["consumer.ts", usageFixtureFilename]
  }, null, 2));

  run(process.execPath, [
    join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    "tsconfig.json"
  ], consumerDirectory);

  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  for (const [subpath, entry] of Object.entries(packageJson.exports ?? {})) {
    for (const condition of ["types", "import"]) {
      const relativePath = entry?.[condition];
      if (typeof relativePath !== "string" || !existsSync(join(repositoryRoot, relativePath))) {
        throw new Error(`Missing ${condition} target for export ${subpath}.`);
      }
    }
  }

  process.stdout.write(
    `Verified ${allEntrypoints.length} packed ESM and declaration entrypoints plus usage conformance.\n`
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const output = join(temporaryRoot, "command-output.txt");
  const fd = openSync(output, "w");
  try { execFileSync(command, args, { cwd, stdio: ["ignore", fd, "inherit"] }); }
  finally { closeSync(fd); }
  return readFileSync(output, "utf8");
}

function symlinkDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`Required package directory is missing: ${source}`);
  }
  symlinkSync(source, destination, "dir");
}
