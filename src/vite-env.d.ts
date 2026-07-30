/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MP_SERVER_URL?: string;
  readonly VITE_ENABLE_DEVELOPER_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
}
