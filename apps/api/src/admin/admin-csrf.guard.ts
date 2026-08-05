import { Injectable } from '@nestjs/common';
import { CsrfGuard } from '../security/csrf.guard';

@Injectable()
export class AdminCsrfGuard extends CsrfGuard {
  constructor() {
    super('admin_csrf');
  }
}

