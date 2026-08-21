import { Injectable } from '@nestjs/common';
import { chmod, mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { ENV } from '../config/env';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class InvalidProfileImageError extends Error {}

@Injectable()
export class ProfileService {
  async saveAvatar(userId: string, input: Buffer): Promise<string> {
    if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) {
      throw new InvalidProfileImageError('profile image must be between 1 byte and 5 MB');
    }

    let output: Buffer;
    try {
      output = await sharp(input, { limitInputPixels: 16_000_000 })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw new InvalidProfileImageError('invalid profile image');
    }
    if (output.length > MAX_OUTPUT_BYTES) throw new InvalidProfileImageError('profile image output is too large');
    const path = this.avatarPath(userId, randomBytes(16).toString('hex'));
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await chmod(dirname(path), 0o755);
    await writeFile(temp, output, { mode: 0o644 });
    await chmod(temp, 0o644);
    await rename(temp, path);
    return `${ENV.staticOrigin}/img/profile/${encodeURIComponent(path.split('/').pop()!)}`;
  }

  async deleteAvatar(userId: string): Promise<void> {
    const root = resolve(ENV.profileStorageDir);
    const files = await readdir(root).catch(() => [] as string[]);
    await Promise.all(files
      .filter((file) => new RegExp(`^${userId}(?:-[0-9a-f]{32})?\\.png$`, 'i').test(file))
      .map((file) => unlink(resolve(root, file))));
  }

  private avatarPath(userId: string, suffix?: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new Error('invalid user id');
    }
    const root = resolve(ENV.profileStorageDir);
    const path = resolve(root, `${userId}${suffix ? `-${suffix}` : ''}.png`);
    if (!path.startsWith(root + sep)) throw new Error('profile path escaped storage root');
    return path;
  }
}
