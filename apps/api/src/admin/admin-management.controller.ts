import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminManagementService } from './admin-management.service';
import { validateClientId } from '../clients/client-input';

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

  @Get('clients/:clientId/memberships')
  clientMemberships(@Param('clientId') clientId: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.management.listClientMemberships(validateClientId(clientId), this.normalizeLimit(limit), this.normalizeOffset(offset));
  }

  @Patch('users/:userId/memberships/:clientId')
  @UseGuards(AdminCsrfGuard)
  async membership(@Param('userId') userId: string, @Param('clientId') clientId: string, @Body() body: unknown) {
    try {
      this.assertUserId(userId);
      const validClientId = validateClientId(clientId);
      const update = this.validateMembershipPatch(body);
      const result = await this.management.updateMembership(userId, validClientId, update);
      await this.audit.record({ action: 'membership.update', userId, clientId: validClientId, details: update });
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

  private validateMembershipPatch(body: unknown): { role?: string; status?: string } {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('membership patch body must be an object');
    }
    const keys = Object.keys(body);
    const input = body as { role?: unknown; status?: unknown };
    if (keys.length === 0 || keys.some((key) => key !== 'role' && key !== 'status') ||
        (input.role !== undefined && typeof input.role !== 'string') ||
        (input.status !== undefined && typeof input.status !== 'string')) {
      throw new BadRequestException('membership patch must contain role and/or status');
    }
    return { role: input.role as string | undefined, status: input.status as string | undefined };
  }

  private normalizeLimit(value?: string) {
    return this.parsePaginationValue(value, 50, 100, 'limit');
  }

  private normalizeOffset(value?: string) {
    return this.parsePaginationValue(value, 0, 100000, 'offset');
  }

  private parsePaginationValue(value: string | undefined, fallback: number, max: number, name: string) {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) throw new BadRequestException(`invalid ${name}`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > max) throw new BadRequestException(`invalid ${name}`);
    return parsed;
  }
}
