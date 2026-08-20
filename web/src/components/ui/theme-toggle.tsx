'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
  sidebar?: boolean;
}

export function ThemeToggle({ sidebar = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Modo claro' : 'Modo escuro';
  const Icon = isDark ? Sun : Moon;
  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  if (!mounted) {
    return sidebar ? (
      <div className="h-10 w-full rounded-lg" />
    ) : (
      <div className="h-8 w-8 rounded-md" />
    );
  }

  if (sidebar) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <Icon className="size-5 shrink-0" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
