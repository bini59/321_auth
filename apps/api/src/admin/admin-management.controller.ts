import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminManagementService } from './admin-management.service';

@Controller('admin/api')
@UseGuards(AdminSessionGuard)
export class AdminManagementController {
  constructor(private readonly management: AdminManagementService, private readonly audit: AdminAuditService) {}

  @Get('users')
  users(@Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.management.listUsers(search, Math.min(Math.max(Number(limit ?? 50) || 50, 1), 100), Math.max(Number(offset ?? 0) || 0, 0));
  }

  @Get('users/:userId')
  user(@Param('userId') userId: string) {
    this.assertUserId(userId);
    return this.management.getUser(userId);
  }

  @Patch('users/:userId/memberships/:clientId')
  @UseGuards(AdminCsrfGuard)
  async membership(@Param('userId') userId: string, @Param('clientId') clientId: string, @Body() body: { role?: string; status?: string }) {
    try {
      this.assertUserId(userId);
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(clientId)) throw new BadRequestException('invalid client id');
      const result = await this.management.updateMembership(userId, clientId, body.role, body.status);
      await this.audit.record({ action: 'membership.update', userId, clientId, details: { role: body.role, status: body.status } });
      return result;
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('invalid') || error.message.endsWith('required'))) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post('users/:userId/revoke-sessions')
  @UseGuards(AdminCsrfGuard)
  async revokeSessions(@Param('userId') userId: string) {
    this.assertUserId(userId);
    await this.management.revokeAllSessions(userId);
    await this.audit.record({ action: 'sessions.revoke_all', userId });
    return { ok: true };
  }

  @Get('audit')
  auditLog(@Query('limit') limit?: string) { return this.audit.recent(Math.min(Math.max(Number(limit ?? 50) || 50, 1), 100)); }

  private assertUserId(userId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new BadRequestException('invalid user id');
  }
}
