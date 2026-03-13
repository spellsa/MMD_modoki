/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module "*.3dl?raw" {
  const content: string;
  export default content;
}
