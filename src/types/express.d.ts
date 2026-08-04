import type { ClientRow } from '../clients/clients.service';

declare global {
  namespace Express {
    interface Request {
      authClientId?: string;
      authClient?: ClientRow;
    }
  }
}

export {};
