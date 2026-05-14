import { createClient as _createClient } from '@metagptx/web-sdk';

let clientInstance: ReturnType<typeof _createClient> | null = null;

export function getClient() {
  if (!clientInstance) {
    clientInstance = _createClient();
  }
  return clientInstance;
}