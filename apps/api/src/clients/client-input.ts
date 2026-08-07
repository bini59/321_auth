import { BadRequestException } from '@nestjs/common';

const CLIENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function validateClientInput(input: {
  client_id?: unknown;
  service_id?: unknown;
  serviceId?: unknown;
  name?: unknown;
  allowed_origins?: unknown;
  default_redirect?: unknown;
  auto_provision?: unknown;
  onboarding_path?: unknown;
}) {
  const rawClientId = input.service_id ?? input.serviceId ?? input.client_id;
  const clientId = typeof rawClientId === 'string' ? rawClientId.trim() : '';
  const identifiers = [input.client_id, input.service_id, input.serviceId]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim());
  if (new Set(identifiers).size > 1) throw new BadRequestException('conflicting service identifiers');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const origins = Array.isArray(input.allowed_origins)
    ? input.allowed_origins.map((value) => typeof value === 'string' ? value.trim() : '')
    : [];
  const redirect = typeof input.default_redirect === 'string' ? input.default_redirect.trim() : '';
  if (!CLIENT_ID.test(clientId)) throw new BadRequestException('invalid client_id');
  if (!name || name.length > 120) throw new BadRequestException('invalid name');
  if (origins.length === 0 || origins.some((origin) => !isOrigin(origin))) {
    throw new BadRequestException('allowed_origins must contain valid http(s) origins');
  }
  if (!isRedirect(redirect, origins)) throw new BadRequestException('default_redirect must use an allowed origin');
  if (typeof input.auto_provision !== 'boolean') throw new BadRequestException('auto_provision must be boolean');
  const onboardingPath = input.onboarding_path == null ? null : input.onboarding_path;
  if (onboardingPath !== null && (typeof onboardingPath !== 'string' || !onboardingPath.startsWith('/') || onboardingPath.startsWith('//'))) {
    throw new BadRequestException('invalid onboarding_path');
  }
  return { clientId, name, origins, redirect, autoProvision: input.auto_provision, onboardingPath };
}

function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export function isOrigin(value: string): boolean {
  const url = parseUrl(value);
  return !!url && url.origin === value && url.pathname === '/' && !url.search && !url.hash;
}

function isRedirect(value: string, origins: string[]): boolean {
  const url = parseUrl(value);
  return !!url && origins.includes(url.origin);
}
