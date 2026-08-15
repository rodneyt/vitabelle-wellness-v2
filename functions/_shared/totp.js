const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += base32chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32chars[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  str = str.toUpperCase().replace(/=+$/, '');
  const length = str.length;
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(((length * 5) / 8) | 0);

  for (let i = 0; i < length; i++) {
    value = (value << 5) | base32chars.indexOf(str[i]);
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return output.buffer;
}

export async function generateTOTPSecret() {
  const secretBytes = new Uint8Array(20); // 160 bits
  crypto.getRandomValues(secretBytes);
  return base32Encode(secretBytes);
}

export function generateTOTPUri(secret, accountName, issuer) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function getHOTP(secretBuffer, counter) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  // BigInt math fallback using Uint32 for older runtimes
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter & 0xffffffff, false);

  const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  );

  return (code % 1000000).toString().padStart(6, '0');
}

export async function verifyTOTP(token, secret, window = 1) {
  const secretBuffer = base32Decode(secret);
  const currentCounter = Math.floor(Date.now() / 30000);

  for (let i = -window; i <= window; i++) {
    const hotp = await getHOTP(secretBuffer, currentCounter + i);
    if (hotp === token) {
      return true;
    }
  }

  return false;
}
