import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmbeddedSurfaceService } from "../src/services/index.js";
import * as threeHost from "../src/hosts/three.js";

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
      "./coordination": {
        types: "./dist/coordination/index.d.ts",
        import: "./dist/coordination/index.js"
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

  it("does not expose deprecated surface or three host aliases", () => {
    const surfaces = createEmbeddedSurfaceService();
    const retiredSurfaceUpdater = ["set", "State"].join("");
    const retiredXrHost = ["create", "Xr", "Tablet", "Host"].join("");
    const retiredHeldDriver = ["create", "Held", "Tablet", "Driver"].join("");
    const retiredSurfaceUpdateType = ["Embedded", "Surface", "State", "Update"].join("");
    const retiredPoseField = ["xr", "Pose"].join("");
    const retiredXrOptions = ["Xr", "Tablet", "Host", "Options"].join("");
    const retiredHeldOptions = ["Held", "Tablet", "Driver", "Options"].join("");

    expect(retiredSurfaceUpdater in surfaces).toBe(false);
    expect(retiredXrHost in threeHost).toBe(false);
    expect(retiredHeldDriver in threeHost).toBe(false);

    const servicesContract = readFileSync(
      new URL("../src/services/contracts.ts", import.meta.url),
      "utf8"
    );
    const threeHostSource = readFileSync(new URL("../src/hosts/three.ts", import.meta.url), "utf8");

    expect(servicesContract).not.toContain(retiredSurfaceUpdateType);
    expect(servicesContract).not.toContain(retiredSurfaceUpdater);
    expect(threeHostSource).not.toContain(retiredPoseField);
    expect(threeHostSource).not.toContain(retiredXrOptions);
    expect(threeHostSource).not.toContain(retiredHeldOptions);
  });
});

function readPackageJson(): PackageJsonShape {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJsonShape;
}
