/**
 * Foundry broadcasts document updates to clients. Ownership controls writes, but
 * is not a confidentiality boundary for payloads. Encrypt private ledger pages
 * and per-user projections before they enter any Document or socket message.
 */
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
const utf8 = new TextEncoder(), decoder = new TextDecoder();
let identity;
const KEY_FLAG = 'relationsPublicKey';
export function publicIdentity(user) { return user?.getFlag?.('Veilrunner', KEY_FLAG); }
const identityStorageKey = () => 'Veilrunner.relations.identity.' + game.world.id + '.' + game.user.id;
export function exportRelationsIdentity() { return localStorage.getItem(identityStorageKey()); }
export async function restoreRelationsIdentity(saved) {
  const parsed = JSON.parse(saved);
  await crypto.subtle.importKey('jwk', parsed.privateKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  if (parsed.privateKey.n !== parsed.publicKey.n) throw new Error('Access key does not match its public identity.');
  localStorage.setItem(identityStorageKey(), JSON.stringify(parsed));
  await initializeRelationsIdentity();
}
export async function initializeRelationsIdentity() {
  const storageKey = identityStorageKey();
  let saved = localStorage.getItem(storageKey);
  if (saved) {
    saved = JSON.parse(saved);
    identity = { privateKey: await crypto.subtle.importKey('jwk', saved.privateKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']), publicKey: saved.publicKey };
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey), publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
    localStorage.setItem(storageKey, JSON.stringify({ privateKey, publicKey }));
    identity = { privateKey: pair.privateKey, publicKey };
  }
  if (JSON.stringify(publicIdentity(game.user)) !== JSON.stringify(identity.publicKey)) await game.user.setFlag('Veilrunner', KEY_FLAG, identity.publicKey);
}
export async function sealRelations(data, recipients) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key), iv = crypto.getRandomValues(new Uint8Array(12));
  const keys = {}, keyIds = {};
  for (const user of recipients) {
    const jwk = publicIdentity(user);
    if (!jwk) continue;
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    keys[user.id] = encode(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw));
    keyIds[user.id] = jwk.n;
  }
  if (!Object.keys(keys).length) throw new Error('No recipient has initialized Relations on this browser.');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8.encode(JSON.stringify(data)));
  // Chunk large payload encoding to avoid exceeding the argument limit.
  let binary = '';
  const bytes = new Uint8Array(encrypted);
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { encrypted: 1, iv: encode(iv), keys, keyIds, payload: btoa(binary) };
}
export async function unsealRelations(envelope) {
  if (!identity || envelope?.encrypted !== 1 || !envelope.keys?.[game.user.id]) return null;
  try {
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, identity.privateKey, decode(envelope.keys[game.user.id]));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv) }, key, decode(envelope.payload))));
  } catch { return null; }
}
