export interface DataServices {
  // Host-client supplies these semantic capabilities at composition time.
  readonly assetUrl: (asset: string) => string;
  readonly upload: (file: File, signal: AbortSignal) => Promise<{ readonly url: string }>;
}
