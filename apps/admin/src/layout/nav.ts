import type { ComponentType } from 'react';
import { ActivityIcon, BoxIcon, GridIcon, SettingsIcon, UsersIcon } from '@/components/icons';

export const SECTIONS = ['overview', 'users', 'clients', 'operations', 'settings'] as const;
export type Section = (typeof SECTIONS)[number];

export const NAV: Array<{ id: Section; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: '개요', icon: GridIcon },
  { id: 'users', label: '사용자', icon: UsersIcon },
  { id: 'clients', label: '서비스', icon: BoxIcon },
  { id: 'operations', label: '운영', icon: ActivityIcon },
  { id: 'settings', label: '설정', icon: SettingsIcon },
];
export const TITLE: Record<Section, string> = { overview: '개요', users: '사용자', clients: '서비스', operations: '운영', settings: '설정' };
export const BRAND = { name: 'Auth Admin', host: 'bini59.dev' };

export function readSection(): Section {
  const value = window.location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(value) ? (value as Section) : 'overview';
}
