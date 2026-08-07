export function formatAdminCount(value: number | null | undefined): string {
  return value == null ? '확인 필요' : value.toLocaleString();
}

export function serviceStatusLabel(status: 'up' | 'down'): string {
  return status === 'up' ? '정상' : '확인 필요';
}
