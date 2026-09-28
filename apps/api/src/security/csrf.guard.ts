import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ENV } from '../config/env';

// double-submit: 쿠키 csrf 값과 x-csrf-token 헤더 일치 확인.
// csrf 쿠키는 앱 프론트가 읽도록 COOKIE_DOMAIN 전체에 걸려 있어서, 같은 사이트의 다른 하위 도메인도
// 값을 읽거나 심을 수 있다. 그래서 브라우저가 보낸 Origin 이 auth 자신이나 CORS 허용 앱이 아니면 거부한다.
@Injectable()
export class CsrfGuard implements CanActivate {
  protected readonly cookieName: string = 'csrf';
  protected readonly allowAppOrigins: boolean = true;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const origin: string | undefined = req.headers?.origin;
    if (origin && origin !== ENV.authOrigin && !(this.allowAppOrigins && ENV.allowedOrigins.includes(origin))) {
      throw new ForbiddenException('cross-origin request');
    }
    const cookie: string | undefined = req.cookies?.[this.cookieName];
    const queryToken = ['/logout', '/logout/all', '/account/profile', '/account/avatar'].includes(req.path)
      ? req.query?.csrf
      : undefined;
    const header: string | undefined = req.headers['x-csrf-token'] ?? queryToken;
    if (!cookie || !header) throw new ForbiddenException('csrf token missing');

    const a = Buffer.from(String(cookie));
    const b = Buffer.from(String(header));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('csrf token mismatch');
    }
    return true;
  }
}
