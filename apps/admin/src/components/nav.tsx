import type { NavItem } from '@bini59/design';
import { ActivityIcon, BoxIcon, GridIcon, SettingsIcon, UsersIcon } from '@/components/icons';

export type Section = 'overview' | 'users' | 'services' | 'operations' | 'settings';

// 서비스 화면 경로가 /apps 인 이유: 서버가 /admin/services, /admin/clients 를 API 경로로 취급한다(admin-static.ts).
export const NAV: Array<NavItem & { id: Section; to: '/' | '/users' | '/apps' | '/operations' | '/settings' }> = [
  { id: 'overview', label: '개요', icon: <GridIcon />, to: '/' },
  { id: 'users', label: '사용자', icon: <UsersIcon />, to: '/users' },
  { id: 'services', label: '서비스', icon: <BoxIcon />, to: '/apps' },
  { id: 'operations', label: '운영', icon: <ActivityIcon />, to: '/operations' },
  { id: 'settings', label: '설정', icon: <SettingsIcon />, to: '/settings' },
];
export const TITLE: Record<Section, string> = { overview: '개요', users: '사용자', services: '서비스', operations: '운영', settings: '설정' };
export const BRAND = { name: 'Auth Admin', host: 'bini59.dev' };

/** 현재 경로(basepath 제외)가 속한 사이드바 항목. */
export const sectionOf = (pathname: string): Section =>
  NAV.find((item) => item.to !== '/' && (pathname === item.to || pathname.startsWith(item.to + '/')))?.id ?? 'overview';
