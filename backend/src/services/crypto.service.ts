import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

export function getEncryptionKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Combine iv (12 bytes) + tag (16 bytes) + encrypted text
  const payload = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
  return payload.toString('base64');
}

export function decrypt(encryptedBase64: string): string {
  const buffer = Buffer.from(encryptedBase64, 'base64');

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encryptedText = buffer.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedText.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
