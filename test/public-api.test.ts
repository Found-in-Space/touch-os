import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageJsonExportsEntry {
  types?: string;
  import?: string;
}

interface PackageJsonShape {
  exports?: Record<string, PackageJsonExportsEntry>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  license?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  homepage?: string;
  bugs?: {
    url?: string;
  };
}

describe("public package api", () => {
  it("keeps host adapters behind explicit subpath exports", () => {
    const packageJson = readPackageJson();

    expect(packageJson.exports).toMatchObject({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      },
      "./hosts": {
        types: "./dist/hosts/index.d.ts",
        import: "./dist/hosts/index.js"
      },
      "./hosts/three": {
        types: "./dist/hosts/three.d.ts",
        import: "./dist/hosts/three.js"
      }
    });

    expect(packageJson.exports).not.toHaveProperty("./hosts/*");
  });

  it("treats three as an optional peer dependency", () => {
    const packageJson = readPackageJson();

    expect(packageJson.peerDependenciesMeta).toMatchObject({
      three: {
        optional: true
      }
    });
  });

  it("includes repository metadata for npm consumers", () => {
    const packageJson = readPackageJson();

    expect(packageJson).toMatchObject({
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/Found-in-Space/touch-os.git"
      },
      homepage: "https://github.com/Found-in-Space/touch-os#readme",
      bugs: {
        url: "https://github.com/Found-in-Space/touch-os/issues"
      }
    });
  });
});

function readPackageJson(): PackageJsonShape {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJsonShape;
}
