import { Injectable } from '@nestjs/common';
import { CsrfGuard } from '../security/csrf.guard';

@Injectable()
export class AdminCsrfGuard extends CsrfGuard {
  protected override readonly cookieName = 'admin_csrf';
}
