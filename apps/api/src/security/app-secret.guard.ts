import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';

// 앱 서버 전용 — 쿠키가 아니라 x-app-secret 헤더로 인증
@Injectable()
export class AppSecretGuard implements CanActivate {
  constructor(private readonly clients: ClientsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const secret: string | undefined = req.headers['x-app-secret'];
    const clientId: string | undefined = req.query?.client_id ?? req.body?.clientId;
    if (!secret || !clientId) throw new UnauthorizedException();

    const client = await this.clients.verifySecret(clientId, secret);
    if (!client || !client.is_active) throw new UnauthorizedException();

    req.authClient = client;
    req.authClientId = clientId;
    return true;
  }
}
