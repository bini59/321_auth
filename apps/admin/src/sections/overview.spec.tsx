import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminOverview } from '../api';
import { OverviewSection } from './overview';

describe('OverviewSection', () => {
  it('renders all six overview metrics from the nested API contract', () => {
    const data: AdminOverview = {
      counts: {
        users: 12,
        clients: 3,
        memberships: 21,
        suspendedMemberships: 4,
        activeSessions: 2,
        deletionRequests: 5,
      },
      services: { api: 'up', postgres: 'up', redis: 'up' },
    };

    const html = renderToStaticMarkup(<OverviewSection data={data} />);

    for (const label of ['사용자', '서비스', '활성 멤버십', '정지 멤버십', '활성 세션', '탈퇴 요청']) {
      expect(html).toContain(label);
    }
    for (const value of ['12', '3', '21', '4', '2', '5']) expect(html).toContain(value);
    expect(html).toContain('검토');
  });

  it('shows 확인 필요 for unavailable nested metrics', () => {
    const data: AdminOverview = {
      counts: {
        users: null,
        clients: null,
        memberships: null,
        suspendedMemberships: null,
        activeSessions: null,
        deletionRequests: null,
      },
      services: { api: 'up', postgres: 'down', redis: 'down' },
    };

    const html = renderToStaticMarkup(<OverviewSection data={data} />);

    expect((html.match(/확인 필요/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(html).not.toContain('badge--danger');
  });
});
