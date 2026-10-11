import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/crypto.js";

const plain = "sample-secret-value";
const a = await encryptSecret("phrase one", plain);
const b = await encryptSecret("phrase one", plain);

assert.equal(await decryptSecret("phrase one", a), plain, "round trip");
assert.notEqual(a.ct, b.ct, "fresh salt/iv each time");
assert.ok(!JSON.stringify(a).includes(plain), "no plaintext in blob");
await assert.rejects(decryptSecret("phrase two", a), /Wrong passphrase/, "wrong passphrase rejected");
await assert.rejects(decryptSecret("phrase one", { ...a, ct: a.ct.slice(0, -4) + "AAAA" }), /Wrong passphrase/, "tampering detected");
console.log("crypto tests passed");
