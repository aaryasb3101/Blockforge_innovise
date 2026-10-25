import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ConsensusMonitoringDashboard } from './pages/ConsensusMonitoringDashboard';
import { HomePage } from './pages/HomePage';
import { VerifierPage } from './pages/VerifierPage';
import { IssuerPage } from './pages/IssuerPage';
import { WalletPage } from './pages/WalletPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { AuditPage } from './pages/AuditPage';
import { RegistryPage } from './pages/RegistryPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { OfflinePage } from './pages/OfflinePage';
import { SettingsPage } from './pages/SettingsPage';
import { Toaster } from 'react-hot-toast';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const location = useLocation();

  useEffect(() => {
    // Synchronize HTML root element class for dark mode
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-surface-base text-surface-text font-sans selection:bg-brand-500 selection:text-white transition-colors duration-200">
      <Navbar
        theme={theme}
        setTheme={setTheme}
        isOffline={location.pathname === '/offline'}
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
        <Routes>
          <Route path="/" element={<ConsensusMonitoringDashboard />} />
          <Route path="/consensus" element={<ConsensusMonitoringDashboard />} />
          <Route path="/home" element={<HomePage />} />

          <Route path="/verifier" element={<VerifierPage />} />
          <Route path="/issuer" element={<IssuerPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/registry" element={<RegistryPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route
            path="/settings"
            element={<SettingsPage theme={theme} setTheme={setTheme} />}
          />
        </Routes>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            '!bg-surface-card !text-surface-text !border !border-surface-border !rounded-2xl !text-xs !shadow-2xl',
        }}
      />
    </div>
  );
};
