import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  ShieldCheck,
  Building2,
  Wallet,
  Skull,
  History,
  Network,
  AlertTriangle,
  WifiOff,
  Settings,
  Sun,
  Moon,
  Sparkles,
  ExternalLink,
} from 'lucide-react';


interface NavbarProps {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  isOffline?: boolean;
}

import { fetchHealth } from '../lib/api';

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  setTheme,
  isOffline,
}) => {
  const navigate = useNavigate();
  const [chainBlock, setChainBlock] = React.useState<number>(12480);

  React.useEffect(() => {
    fetchHealth().then((h) => {
      if (h.block) setChainBlock(h.block);
    });
  }, []);

  const navItems = [
    { to: '/', label: 'Consensus Monitor', icon: Activity, highlight: true },
    { to: '/verifier', label: 'Verifier', icon: ShieldCheck },
    { to: '/playground', label: 'Fraud Playground', icon: Skull },
    { to: '/audit', label: 'Audit Explorer', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];


  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-border bg-surface-base/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <div
          onClick={() => navigate('/')}
          className="flex cursor-pointer items-center space-x-3 group"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 p-0.5 shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-surface-card">
              <ShieldCheck className="h-5 w-5 text-brand-400 group-hover:rotate-6 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xl font-black tracking-tight text-surface-text">
                CRED<span className="text-brand-400">LEDGER</span>
              </span>
              <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-400 border border-brand-500/20">
                v1.0
              </span>
            </div>
            <p className="text-[10px] font-medium text-surface-muted hidden sm:block">
              Decentralized Trust & Consensus Infrastructure
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? item.highlight
                         ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                        : 'bg-surface-elevated text-brand-400 border border-surface-border'
                      : 'text-surface-muted hover:bg-surface-elevated hover:text-surface-text'
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right Action Bar */}
        <div className="flex items-center space-x-3">
          {/* Offline / Online Status Pill */}
          <div
            className={`hidden sm:flex items-center space-x-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-medium border ${
              isOffline
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isOffline ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span>{isOffline ? 'OFFLINE SNAPSHOT' : `CHAIN: 31337 (#${chainBlock})`}</span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-surface-border bg-surface-card text-surface-muted hover:text-surface-text hover:bg-surface-elevated transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-brand-400" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Bar */}
      <div className="lg:hidden flex items-center overflow-x-auto border-t border-surface-border px-4 py-2 space-x-1 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-surface-muted hover:bg-surface-elevated'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </header>
  );
};
