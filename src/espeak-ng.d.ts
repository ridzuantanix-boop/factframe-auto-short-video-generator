declare module "espeak-ng" {
  type ESpeakModule = { FS: { readFile(path: string): Uint8Array } };
  export default function ESpeakNg(options: { arguments: string[] }): Promise<ESpeakModule>;
}
