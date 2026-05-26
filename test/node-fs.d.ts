declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: string): string;
}

declare module "node:zlib" {
  export function inflateSync(buffer: Uint8Array): Uint8Array;
}

declare class Buffer extends Uint8Array {}
