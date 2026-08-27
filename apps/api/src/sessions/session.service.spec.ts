import { describe, expect, it, vi } from 'vitest';
import { SessionService } from './session.service';

function redisWith(sessions: Record<string, Record<string, string>>, sids: string[]) {
  return {
    smembers: vi.fn().mockResolvedValue(sids),
    hgetall: vi.fn(async (key: string) => sessions[key.replace('sess:', '')] ?? {}),
  };
}

describe('SessionService.listForUser', () => {
  it('marks the current session and sorts the rest by recency', async () => {
    const redis = redisWith(
      {
        'sid-old': { userId: 'u1', createdAt: '1', lastSeenAt: '100', ua: 'A', ip: '1.1.1.1' },
        'sid-new': { userId: 'u1', createdAt: '2', lastSeenAt: '300', ua: 'B', ip: '2.2.2.2' },
        'sid-here': { userId: 'u1', createdAt: '3', lastSeenAt: '200', ua: 'C', ip: '3.3.3.3' },
      },
      ['sid-old', 'sid-new', 'sid-here'],
    );

    const sessions = await new SessionService(redis as never).listForUser('u1', 'sid-here');

    expect(sessions.map((session) => session.id)).toEqual(['sid-here', 'sid-new', 'sid-old']);
    expect(sessions[0]).toMatchObject({ current: true, ua: 'C', ip: '3.3.3.3', lastSeenAt: 200 });
    expect(sessions[1].current).toBe(false);
  });

  it('drops sids whose session hash has already expired', async () => {
    const redis = redisWith({ 'sid-live': { userId: 'u1', createdAt: '1', lastSeenAt: '1', ua: '', ip: '' } }, ['sid-live', 'sid-gone']);
    await expect(new SessionService(redis as never).listForUser('u1')).resolves.toHaveLength(1);
  });

  it('returns nothing when the user has no session set', async () => {
    const redis = redisWith({}, []);
    await expect(new SessionService(redis as never).listForUser('u1')).resolves.toEqual([]);
    expect(redis.hgetall).not.toHaveBeenCalled();
  });
});
