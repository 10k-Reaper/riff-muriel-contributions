// Sync `crypto.createHash('sha1')` (server.js keys lyrics files with it; WebCrypto is async-only).
function sha1Bytes(bytes) {
  const ml = bytes.length * 8;
  const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml >>> 0);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 2 ** 32));
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
  const w = new Uint32Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5A827999] : i < 40 ? [b ^ c ^ d, 0x6ED9EBA1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8F1BBCDC] : [b ^ c ^ d, 0xCA62C1D6];
      const t = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

function createHash(alg) {
  if (String(alg).toLowerCase() !== 'sha1') throw new Error('only sha1 is available on iOS');
  const parts = [];
  return {
    update(d) { parts.push(typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d)); return this; },
    digest(enc) {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      const hex = sha1Bytes(all);
      return enc === 'hex' ? hex : Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16)));
    },
  };
}

module.exports = { createHash, _sha1: (s) => createHash('sha1').update(s).digest('hex') };
