import { deflateSync, inflateSync } from 'fflate';

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compresses an arbitrary object using fflate deflate and encodes it to compact base64url format for QR codes.
 */
export function encodeForQr(obj: any): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const compressed = deflateSync(bytes);
  return uint8ArrayToBase64Url(compressed);
}

/**
 * Decodes and decompresses a base64url-encoded QR code payload back into an object.
 */
export function decodeFromQr<T = any>(str: string): T {
  const compressed = base64UrlToUint8Array(str);
  const decompressed = inflateSync(compressed);
  const json = new TextDecoder().decode(decompressed);
  return JSON.parse(json);
}
