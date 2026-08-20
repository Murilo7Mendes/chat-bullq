'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Users, Tags, Bell, Building2, KeyRound, Sparkles, Layers, ShieldCheck } from 'lucide-react';

const tabs = [
  { href: '/settings/channels', label: 'Canais', icon: Radio },
  { href: '/settings/segments', label: 'Segmentos', icon: Layers },
  { href: '/settings/general', label: 'Geral', icon: Building2 },
  { href: '/settings/ai', label: 'IA', icon: Sparkles },
  { href: '/settings/vigia', label: 'Vigia', icon: ShieldCheck },
  { href: '/settings/members', label: 'Membros', icon: Users },
  { href: '/settings/tags', label: 'Tags', icon: Tags },
  { href: '/settings/notifications', label: 'Notificações', icon: Bell },
  { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar nav */}
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 lg:flex lg:flex-col">
        <div className="px-4 pb-2 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Configurações
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700'
                    : 'text-zinc-500 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                }`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile top nav (small screens) */}
      <div className="flex w-full flex-col lg:hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 dark:border-zinc-800">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-primary dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>

      {/* Desktop content */}
      <main className="hidden flex-1 overflow-y-auto p-8 lg:block">
        {children}
      </main>
    </div>
  );
}
