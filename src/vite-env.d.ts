/// <reference types="vite/client" />

declare module "*.patch?raw" {
  const patch: string;
  export default patch;
}
