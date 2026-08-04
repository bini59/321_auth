import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

// double-submit: 쿠키 csrf 값과 x-csrf-token 헤더 일치 확인
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const cookie: string | undefined = req.cookies?.csrf;
    const header: string | undefined = req.headers['x-csrf-token'];
    if (!cookie || !header) throw new ForbiddenException('csrf token missing');

    const a = Buffer.from(String(cookie));
    const b = Buffer.from(String(header));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('csrf token mismatch');
    }
    return true;
  }
}
