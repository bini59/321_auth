import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ENV } from './config/env';
import { installAdminStatic } from './admin-static';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', ENV.staticOrigin],
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
