import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ClientsService, hashAppSecret } from '../clients/clients.service';
import { validateClientInput } from '../clients/client-input';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminSessionGuard } from './admin-session.guard';

@Controller(['admin/clients', 'admin/services'])
@UseGuards(AdminSessionGuard)
export class AdminClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list() { return this.clients.list().then((clients) => clients.map(withServiceView)); }

  @Get(':clientId')
  async detail(@Param('clientId') clientId: string) {
    const client = await this.clients.find(clientId);
    if (!client) throw new NotFoundException('client not found');
    const { secret_hash: _secretHash, ...safeClient } = client;
    return withServiceView(safeClient);
  }

  @Post()
  @UseGuards(AdminCsrfGuard)
  async create(@Body() body: Record<string, unknown>) {
    const input = validateClientInput(body);
    const secret = randomBytes(32).toString('base64url');
    try {
      const result = await this.clients.create({ client_id: input.clientId, name: input.name, allowed_origins: input.origins, default_redirect: input.redirect, auto_provision: input.autoProvision, onboarding_path: input.onboardingPath, secret_hash: hashAppSecret(secret) });
      if (!result.rowCount) throw new ConflictException('client_id already exists');
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('client_id already exists');
      throw error;
    }
    const client = await this.clients.find(input.clientId);
    if (!client) throw new BadRequestException('client creation failed');
    const { secret_hash: _secretHash, ...safeClient } = client;
    return { client: withServiceView(safeClient), service: withServiceView(safeClient), secret };
  }

  @Patch(':clientId')
  @UseGuards(AdminCsrfGuard)
  async update(@Param('clientId') clientId: string, @Body() body: Record<string, unknown>) {
    const input = validateClientInput({ ...body, client_id: clientId });
    const client = await this.clients.update(clientId, { name: input.name, allowed_origins: input.origins, default_redirect: input.redirect, auto_provision: input.autoProvision, onboarding_path: input.onboardingPath });
    if (!client) throw new NotFoundException('client not found');
    return withServiceView(client);
  }

  @Delete(':clientId')
  @UseGuards(AdminCsrfGuard)
  async deactivate(@Param('clientId') clientId: string) {
    const client = await this.clients.setActive(clientId, false);
    if (!client) throw new NotFoundException('client not found');
    return withServiceView(client);
  }

  @Post(':clientId/activate')
  @UseGuards(AdminCsrfGuard)
  async activate(@Param('clientId') clientId: string) {
    const client = await this.clients.setActive(clientId, true);
    if (!client) throw new NotFoundException('client not found');
    return withServiceView(client);
  }

  @Post(':clientId/rotate-secret')
  @UseGuards(AdminCsrfGuard)
  async rotateSecret(@Param('clientId') clientId: string) {
    const secret = randomBytes(32).toString('base64url');
    const client = await this.clients.rotateSecret(clientId, hashAppSecret(secret));
    if (!client) throw new NotFoundException('client not found');
    return { ...withServiceView(client), secret };
  }
}

function withServiceView<T extends { client_id: string; name: string }>(client: T) {
  return {
    ...client,
    service_id: client.client_id,
    serviceId: client.client_id,
    service_name: client.name,
    serviceName: client.name,
  };
}
