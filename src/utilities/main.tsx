import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { ThemeProvider } from '@/core/components/theme-provider';
import { UtilitiesApp } from './UtilitiesApp';

createRoot(document.getElementById('utilities-root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="maneuver-utilities-theme">
      <UtilitiesApp />
    </ThemeProvider>
  </StrictMode>
);
