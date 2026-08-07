import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { AdminSessionService } from './admin/admin-session.service';

export const ADMIN_DIST = join(process.cwd(), 'apps/admin/dist');

export function shouldFallbackToAdminShell(pathname: string): boolean {
  return pathname !== '/' && !pathname.startsWith('/auth/') && pathname !== '/auth' && !pathname.startsWith('/api/') && pathname !== '/api' && posix.extname(pathname) === '';
}

export function shouldServeAdminShell(pathname: string): boolean {
  return pathname === '/' || shouldFallbackToAdminShell(pathname);
}

export function shouldRequireAdminLogin(pathname: string): boolean {
  return shouldServeAdminShell(pathname) && pathname !== '/login';
}

export function installAdminStatic(app: INestApplication): void {
  if (!existsSync(ADMIN_DIST)) return;

  const instance = app.getHttpAdapter().getInstance();
  const shell = join(ADMIN_DIST, 'index.html');
  const sessions = app.get(AdminSessionService);
  instance.use('/admin', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const pathname = req.path;
    if (pathname === '/auth' || pathname.startsWith('/auth/') || pathname === '/api' || pathname.startsWith('/api/')) return next();
    if (!shouldRequireAdminLogin(pathname)) {
      if (shouldServeAdminShell(pathname)) return res.sendFile(shell);
      return next();
    }
    const sid = req.cookies?.admin_sid;
    if (!sid) {
      const returnTo = encodeURIComponent(req.originalUrl || '/admin');
      return res.redirect(302, '/admin/login?return_to=' + returnTo);
    }
    return sessions.exists(sid)
      .then((valid) => (valid ? res.sendFile(shell) : res.redirect(302, '/admin/login?return_to=' + encodeURIComponent(req.originalUrl || '/admin'))))
      .catch(next);
  });
}
