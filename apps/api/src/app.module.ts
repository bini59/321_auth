import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { RedisModule } from './redis/redis-module';
import { SessionService } from './sessions/session.service';
import { ClientsService } from './clients/clients.service';
import { OidcService } from './oidc/oidc.service';
import { UsersService } from './users/users.service';
import { MembershipsService } from './memberships/memberships.service';
import { AuthController } from './auth/auth.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ADMIN_DIST } from './admin-static';
import { AdminAuthController } from './admin/admin-auth.controller';
import { AdminSessionService } from './admin/admin-session.service';
import { AdminCsrfGuard } from './admin/admin-csrf.guard';
import { AdminSessionGuard } from './admin/admin-session.guard';
import { AdminClientsController } from './admin/admin-clients.controller';
import { AdminManagementService } from './admin/admin-management.service';
import { AdminAuditService } from './admin/admin-audit.service';
import { AdminManagementController } from './admin/admin-management.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: ADMIN_DIST,
      serveRoot: '/admin',
      renderPath: '/admin',
      serveStaticOptions: { fallthrough: true, index: false, redirect: false },
    }),
    DbModule,
    RedisModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 120 },
    ]),
  ],
  controllers: [AuthController, AdminAuthController, AdminClientsController, AdminManagementController],
  providers: [
    SessionService,
    ClientsService,
    OidcService,
    UsersService,
    MembershipsService,
    AdminSessionService,
    AdminCsrfGuard,
    AdminSessionGuard,
    AdminManagementService,
    AdminAuditService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
