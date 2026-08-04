'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Users, Tags, Bell, Building2, KeyRound, Sparkles, BookUser, Layers } from 'lucide-react';

const tabs = [
  { href: '/settings/channels', label: 'Canais', icon: Radio },
  { href: '/settings/segments', label: 'Segmentos', icon: Layers },
  { href: '/settings/general', label: 'Geral', icon: Building2 },
  { href: '/settings/ai', label: 'IA', icon: Sparkles },
  { href: '/settings/members', label: 'Membros', icon: Users },
  { href: '/settings/contacts', label: 'Contatos', icon: BookUser },
  { href: '/settings/tags', label: 'Tags', icon: Tags },
  { href: '/settings/notifications', label: 'Notificações', icon: Bell },
  { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Configurações</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Gerencie sua organização e integrações
      </p>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
