import { createRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { PageSkeleton } from '@/components/skeleton';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  basepath: '/admin',
  context: { queryClient: undefined as unknown as QueryClient }, // 실제 값은 <RouterProvider context> 에서 주입한다.
  defaultPreload: 'intent',
  defaultPendingComponent: PageSkeleton,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
});

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
