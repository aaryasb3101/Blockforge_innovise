import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const walletCache = new Map<string, ethers.Wallet>();

export class KeystoreService {
  private keystoreDir: string;
  private password: string;

  constructor() {
    this.keystoreDir = config.keystoreDir;
    this.password = config.keystorePassword;
    fs.mkdirSync(this.keystoreDir, { recursive: true });
  }

  private getFilename(role: string, id: string): string {
    const safeRole = role.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.keystoreDir, `${safeRole}_${safeId}.json`);
  }

  public hasWallet(role: string, id: string): boolean {
    const cacheKey = `${role}:${id}`;
    if (walletCache.has(cacheKey)) return true;
    return fs.existsSync(this.getFilename(role, id));
  }

  public async getWallet(role: string, id: string, provider?: ethers.Provider): Promise<ethers.Wallet> {
    const cacheKey = `${role}:${id}`;
    let wallet = walletCache.get(cacheKey);

    if (!wallet) {
      const filepath = this.getFilename(role, id);
      if (!fs.existsSync(filepath)) {
        throw new Error(`Keystore wallet not found for role=${role}, id=${id}`);
      }
      const json = fs.readFileSync(filepath, 'utf8');
      wallet = await ethers.Wallet.fromEncryptedJson(json, this.password);
      walletCache.set(cacheKey, wallet);
    }

    if (provider) {
      return wallet.connect(provider);
    }
    return wallet;
  }

  public async saveWallet(role: string, id: string, wallet: ethers.Wallet): Promise<void> {
    const filepath = this.getFilename(role, id);
    const encrypted = await wallet.encrypt(this.password);
    fs.writeFileSync(filepath, encrypted, 'utf8');
    const cacheKey = `${role}:${id}`;
    walletCache.set(cacheKey, wallet);
  }

  public async getOrCreateWallet(role: string, id: string, provider?: ethers.Provider): Promise<ethers.Wallet> {
    if (this.hasWallet(role, id)) {
      return this.getWallet(role, id, provider);
    }
    const newWallet = ethers.Wallet.createRandom();
    await this.saveWallet(role, id, newWallet);
    if (provider) {
      return newWallet.connect(provider);
    }
    return newWallet;
  }

  public async listDemoHolders(): Promise<{ did: string; address: string; privateKey: string; label: string }[]> {
    if (!config.demoMode) {
      throw new Error('DEMO_MODE is disabled on this server');
    }

    const holders = ['alice', 'bob', 'carol'];
    const results: { did: string; address: string; privateKey: string; label: string }[] = [];

    for (const h of holders) {
      let wallet: ethers.Wallet;
      if (this.hasWallet('holder', h)) {
        wallet = await this.getWallet('holder', h);
      } else {
        wallet = await this.getOrCreateWallet('holder', h);
      }
      results.push({
        label: `Demo Holder: ${h.toUpperCase()}`,
        address: wallet.address,
        privateKey: wallet.privateKey,
        did: `did:pkh:eip155:${config.chainId}:${wallet.address}`,
      });
    }

    return results;
  }
}

export const keystore = new KeystoreService();
