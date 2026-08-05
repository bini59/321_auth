export function validateAdminReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  if (value === '/admin/auth' || value.startsWith('/admin/auth/')) return '/admin';
  return value;
}

