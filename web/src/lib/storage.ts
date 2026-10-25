import { openDB, DBSchema } from 'idb';
import { Credential, Snapshot } from '@shared/types';

export interface CredentialRecord {
  id: string;
  credential: Credential;
}

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

// Convenience Aliases for Wallet
export async function saveCredential(credential: Credential): Promise<void> {
  return saveCredentialToWallet(credential);
}

export async function getCredentials(): Promise<CredentialRecord[]> {
  const creds = await getWalletCredentials();
  return creds.map((c) => ({ id: c.id, credential: c }));
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

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  return saveOfflineSnapshot(snapshot);
}

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const entry = await getOfflineSnapshot();
  return entry ? entry.snapshot : null;
}

// Simulated Clock & Settings
export async function getSimulatedClockOffset(): Promise<number> {
  return getSetting<number>('simulated_clock_offset_hours', 0);
}

export async function setSimulatedClockOffset(hours: number): Promise<void> {
  return setSetting<number>('simulated_clock_offset_hours', hours);
}

export async function clearStorage(): Promise<void> {
  const db = await getDB();
  await db.clear('credentials');
  await db.clear('snapshots');
  await db.clear('settings');
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
