import { Injectable } from '@nestjs/common';
import { CsrfGuard } from '../security/csrf.guard';

@Injectable()
export class AdminCsrfGuard extends CsrfGuard {
  protected override readonly cookieName = 'admin_csrf';
  // 관리자 콘솔은 auth origin 의 SPA 뿐이라 앱 origin 도 받지 않는다.
  protected override readonly allowAppOrigins = false;
}
