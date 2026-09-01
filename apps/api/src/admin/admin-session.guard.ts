import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionService } from './admin-session.service';
import { MembershipsService } from '../memberships/memberships.service';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: AdminSessionService,
    private readonly memberships: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sid = request.cookies?.admin_sid;
    if (!sid || !(await this.sessions.exists(sid))) throw new UnauthorizedException();
    const userId = await this.sessions.userId(sid);
    if (!userId || !(await this.memberships.isAdmin(userId))) throw new UnauthorizedException();
    return true;
  }
}
