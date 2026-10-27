import type { ObjectData } from "@aegis/domain/objects";

export interface SandboxRegistration extends Pick<
  ObjectData["html"],
  "html" | "css" | "js" | "state"
> {
  readonly parentOrigin: string;
  readonly channel: string;
  readonly font: string;
  readonly theme: string;
  readonly motionOff: boolean;
}
export interface ObjectServices {
  readonly assetUrl: (url: string) => string;
  readonly registerSandbox: (
    request: SandboxRegistration,
    signal: AbortSignal,
  ) => Promise<{ readonly url: string }>;
}
