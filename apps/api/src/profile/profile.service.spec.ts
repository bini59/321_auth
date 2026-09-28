import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV } from '../config/env';
import { InvalidProfileImageError, ProfileService } from './profile.service';

const USER = '00000000-0000-4000-8000-000000000001';
let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'avatar-'));
  ENV.profileStorageDir = dir;
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const pixel = (format: 'jpeg' | 'gif') =>
  sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })[format]().toBuffer();

describe('ProfileService.saveAvatar', () => {
  it('accepts an allowed format', async () => {
    await expect(new ProfileService().saveAvatar(USER, await pixel('jpeg'))).resolves.toContain('/img/profile/');
  });

  it('rejects formats outside png/jpeg/webp', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
    await expect(new ProfileService().saveAvatar(USER, svg)).rejects.toBeInstanceOf(InvalidProfileImageError);
    await expect(new ProfileService().saveAvatar(USER, await pixel('gif'))).rejects.toBeInstanceOf(InvalidProfileImageError);
  });
});
