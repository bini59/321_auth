import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import express from 'express';

export const ADMIN_DIST = join(process.cwd(), 'apps/admin/dist');

export function shouldFallbackToAdminShell(pathname: string): boolean {
  return pathname !== '/' && posix.extname(pathname) === '';
}

export function shouldServeAdminShell(pathname: string): boolean {
  return pathname === '/' || shouldFallbackToAdminShell(pathname);
}

export function installAdminStatic(app: INestApplication): void {
  if (!existsSync(ADMIN_DIST)) return;

  const instance = app.getHttpAdapter().getInstance();
  const shell = join(ADMIN_DIST, 'index.html');
  instance.use('/admin', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const pathname = req.path;
    if (!shouldServeAdminShell(pathname)) return next();
    return res.sendFile(shell);
  });
}
