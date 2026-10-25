import type {MediaSyncApi} from '@shared/api';

declare global {
  interface Window {
    mediaSync?: MediaSyncApi;
  }
}

export {};
