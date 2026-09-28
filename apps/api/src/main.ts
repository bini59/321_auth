import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { ENV } from './config/env';
import { installAdminStatic } from './admin-static';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'error', 'warn'] });
  // cloudflared(도커 네트워크)를 거쳐 들어오므로 사설망 hop 만 신뢰해 req.ip 를 실제 클라이언트로 맞춘다.
  // 그렇지 않으면 throttle 키와 세션 IP 가 전부 터널 주소 하나로 묶인다.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // 서버 렌더링 페이지의 테마 부트 스크립트는 인라인이라 요청별 nonce 가 필요하다.
  // 'unsafe-inline' 을 열지 않고 이 nonce 만 script-src 에 추가한다.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', ENV.staticOrigin],
        scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
      },
    },
  }));
  app.use(cookieParser());
  installAdminStatic(app);

  if (ENV.allowedOrigins.length > 0) {
    app.enableCors({
      origin: ENV.allowedOrigins,
      credentials: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );

  await app.listen(ENV.port);
  console.log(`[auth] listening on :${ENV.port} (origin=${ENV.authOrigin})`);
}

bootstrap().catch((err) => {
  console.error('[auth] boot failed:', err);
  process.exit(1);
});
