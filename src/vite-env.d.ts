/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MP_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
}
