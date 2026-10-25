import { openDB, DBSchema } from 'idb';
import { Credential, Snapshot } from '@shared/types';

interface TrustMeshDB extends DBSchema {
  credentials: {
    key: string;
    value: Credential;
    indexes: { 'by-schema': string; 'by-issuer': string };
  };
  snapshots: {
    key: string;
    value: { id: string; snapshot: Snapshot; cachedAt: number };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'trustmesh-db';
const DB_VERSION = 1;

export async function getDB() {
  return openDB<TrustMeshDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('credentials')) {
        const credStore = db.createObjectStore('credentials', { keyPath: 'id' });
        credStore.createIndex('by-schema', 'schema');
        credStore.createIndex('by-issuer', 'issuerDid');
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });
}

// Credential Storage (Holder Wallet)
export async function saveCredentialToWallet(credential: Credential): Promise<void> {
  const db = await getDB();
  await db.put('credentials', credential);
}

export async function getWalletCredentials(): Promise<Credential[]> {
  const db = await getDB();
  return db.getAll('credentials');
}

export async function deleteWalletCredential(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('credentials', id);
}

// Snapshot Storage (Offline Mode)
export async function saveOfflineSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await getDB();
  await db.put('snapshots', {
    id: 'latest',
    snapshot,
    cachedAt: Date.now(),
  });
}

export async function getOfflineSnapshot(): Promise<{ snapshot: Snapshot; cachedAt: number } | null> {
  const db = await getDB();
  const entry = await db.get('snapshots', 'latest');
  return entry ?? null;
}

// Settings Storage
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDB();
  const val = await db.get('settings', key);
  return val !== undefined ? val : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}
