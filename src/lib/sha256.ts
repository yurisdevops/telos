/**
 * SHA-256 puro em JS, auto-contido — `expo-crypto` não está instalado no
 * projeto (é módulo nativo, exigiria rebuild + redistribuição, incompatível
 * com o fluxo 100% OTA usado em todo o resto do app). Implementação direta
 * do pseudocódigo padrão FIPS 180-4 (mesmas constantes iniciais H e tabela
 * de round constants K do padrão publicado), sem otimizações exóticas, pra
 * ficar fácil de auditar a olho. Validada byte a byte contra `node:crypto`
 * (vazio, "abc", inputs multi-chunk >64 bytes).
 *
 * Só serve pro hash do PIN (ver src/db/pin.ts) — não é uma lib de propósito
 * geral, mas nada aqui é específico de PIN; `sha256Hex` funciona pra
 * qualquer string.
 */

const H_INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

// UTF-8 manual (não depende de TextEncoder global, que não é garantido em
// todo runtime Hermes) — trata pares substitutos corretamente pra qualquer
// codepoint, embora PIN+salt (o único uso real hoje) nunca saiam de ASCII.
function utf8ToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i)!;
    if (codePoint > 0xffff) i++; // par substituto consumido junto
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

/** SHA-256 de uma string UTF-8, devolvendo hex minúsculo de 64 caracteres. */
export function sha256Hex(input: string): string {
  const bytes = utf8ToBytes(input);
  const bitLength = bytes.length * 8;

  // Padding padrão: 0x80, zeros até 448 bits (mod 512), depois o comprimento
  // em bits como 64-bit big-endian. Os 32 bits altos ficam sempre em 0 aqui —
  // nenhum input real deste app (PIN+salt) chega perto de 2^32 bits.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 4; i++) bytes.push(0);
  bytes.push((bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff);

  const h = [...H_INIT];
  const w = new Array<number>(64);

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      const offset = chunkStart + i * 4;
      w[i] = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * Salt aleatório em hex — `Math.random()`, não um CSPRNG (não há
 * `crypto.getRandomValues` disponível sem módulo nativo). Suficiente pro que
 * o salt precisa fazer aqui: impedir uma tabela pré-computada de
 * SHA-256(pin) genérica servir contra qualquer device. NÃO é proteção contra
 * um atacante com acesso ao hash+salt de UM device específico — um PIN de 4
 * dígitos (10.000 combinações) é força-bruta trivial de qualquer forma,
 * salt ou não; isso é fricção local, não criptografia de verdade.
 */
export function randomSaltHex(byteLength = 16): string {
  let hex = '';
  for (let i = 0; i < byteLength; i++) {
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return hex;
}
