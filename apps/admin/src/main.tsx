import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import '@/styles/index.css';
import { router } from './router';
import { QueryProvider } from '@/components/query-provider';
import { ToastProvider } from '@/components/toast';

function App() {
  return <RouterProvider router={router} context={{ queryClient: useQueryClient() }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </ToastProvider>
  </StrictMode>,
);
