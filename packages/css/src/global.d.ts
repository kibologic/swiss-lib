/* Node globals for CSS package build - avoid requiring @types/node at base */
declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(value: string | ArrayBuffer, encoding?: string): Buffer;
    toString(encoding?: string): string;
  }
}
declare const Buffer: typeof import("node:buffer").Buffer;
type Buffer = InstanceType<typeof import("node:buffer").Buffer>;
