export interface ClientInfo {
  allowedOrigins: string[];
  defaultRedirect: string;
}

// PRD §7.1 — URL 파싱 → origin 정확 비교. startsWith 방식 금지 (우회 가능).
export function validateReturnTo(returnTo: string | undefined, client: ClientInfo): string {
  if (!returnTo) return client.defaultRedirect;
  try {
    const url = new URL(returnTo);
    if (!client.allowedOrigins.includes(url.origin)) {
      return client.defaultRedirect;
    }
    return url.toString();
  } catch {
    return client.defaultRedirect;
  }
}
