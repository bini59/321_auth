import type { NavItem } from '@bini59/design';
import { ActivityIcon, BoxIcon, GridIcon, SettingsIcon, UsersIcon } from '@/components/icons';

export const SECTIONS = ['overview', 'users', 'clients', 'operations', 'settings'] as const;
export type Section = (typeof SECTIONS)[number];

// 해시 라우팅: AppShell 이 href 로 <a> 를 그리면 hashchange 로 섹션이 바뀐다.
export const NAV: Array<NavItem & { id: Section }> = [
  { id: 'overview', label: '개요', icon: <GridIcon />, href: '#overview' },
  { id: 'users', label: '사용자', icon: <UsersIcon />, href: '#users' },
  { id: 'clients', label: '서비스', icon: <BoxIcon />, href: '#clients' },
  { id: 'operations', label: '운영', icon: <ActivityIcon />, href: '#operations' },
  { id: 'settings', label: '설정', icon: <SettingsIcon />, href: '#settings' },
];
export const TITLE: Record<Section, string> = { overview: '개요', users: '사용자', clients: '서비스', operations: '운영', settings: '설정' };
export const BRAND = { name: 'Auth Admin', host: 'bini59.dev' };

export function readSection(): Section {
  const value = window.location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(value) ? (value as Section) : 'overview';
}
