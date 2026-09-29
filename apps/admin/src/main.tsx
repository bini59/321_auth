import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/theme.css';
import '@/styles/style.css';
import { App } from './app';
import { QueryProvider } from '@/components/query-provider';
import { ToastProvider } from '@/components/toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </ToastProvider>
  </StrictMode>,
);
