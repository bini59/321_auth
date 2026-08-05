export interface ClientInfo {
  // Keep the database row naming here: ClientsService returns PostgreSQL rows
  // directly, so converting these fields to camelCase would otherwise make
  // return-to validation silently fall back to undefined.
  allowed_origins: string[];
  default_redirect: string;
}

// PRD §7.1 — URL 파싱 → origin 정확 비교. startsWith 방식 금지 (우회 가능).
export function validateReturnTo(returnTo: string | undefined, client: ClientInfo): string {
  if (!returnTo) return client.default_redirect;
  try {
    const url = new URL(returnTo);
    if (!client.allowed_origins.includes(url.origin)) {
      return client.default_redirect;
    }
    return url.toString();
  } catch {
    return client.default_redirect;
  }
}
