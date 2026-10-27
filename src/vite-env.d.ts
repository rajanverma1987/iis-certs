/// <reference types="vite/client" />

import type { IisCertApi } from '../electron/preload';

declare global {
  interface Window {
    iisCert: IisCertApi;
  }
}

export {};
