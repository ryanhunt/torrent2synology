// Passphrase-based encryption for the stored DSM password (PBKDF2 -> AES-GCM, via WebCrypto).
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 600000;

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations, usage) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function encryptSecret(passphrase, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS, "encrypt");
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { v: 1, iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptSecret(passphrase, blob) {
  try {
    const key = await deriveKey(passphrase, fromB64(blob.salt), blob.iter, "decrypt");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
    return dec.decode(pt);
  } catch {
    throw new Error("Wrong passphrase");
  }
}
