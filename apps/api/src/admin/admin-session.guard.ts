import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionService } from './admin-session.service';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const sid = req.cookies?.admin_sid;
    if (!sid || !(await this.sessions.exists(sid))) throw new UnauthorizedException();
    return true;
  }
}
