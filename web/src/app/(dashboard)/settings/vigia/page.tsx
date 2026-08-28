'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { vigiaService, VigiaStatus } from '@/features/vigia/services/vigia.service';
import { getSocket } from '@/lib/socket';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

function StatusBadge({ state }: { state: VigiaStatus['state'] }) {
  if (state === 'ok')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Operando
      </span>
    );
  if (state === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertCircle className="h-3 w-3" /> Erro
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <WifiOff className="h-3 w-3" /> Desconectado
    </span>
  );
}

export default function VigiaSettingsPage() {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['vigia-settings'],
    queryFn: () => vigiaService.getSettings(),
  });

  const { data: status } = useQuery({
    queryKey: ['vigia-status'],
    queryFn: () => vigiaService.getStatus(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  // Atualiza status via WebSocket em tempo real
  useEffect(() => {
    const socket = getSocket();
    const handler = (s: VigiaStatus) => {
      qc.setQueryData(['vigia-status'], s);
    };
    socket.on('vigia:status', handler);
    return () => { socket.off('vigia:status', handler); };
  }, [qc]);

  useEffect(() => {
    if (settings && !dirty) setTemplate(settings.messageTemplate);
  }, [settings]);

  const save = useMutation({
    mutationFn: () => vigiaService.saveSettings(template),
    onSuccess: () => {
      toast.success('Template salvo');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['vigia-settings'] });
    },
    onError: () => toast.error('Erro ao salvar template'),
  });

  const reconnect = useMutation({
    mutationFn: () => vigiaService.reconnect(),
    onSuccess: () => {
      toast.success('Reconexão solicitada — próximo tick reconecta automaticamente');
      qc.invalidateQueries({ queryKey: ['vigia-status'] });
    },
    onError: () => toast.error('Erro ao solicitar reconexão'),
  });

  const reset = () => {
    if (settings) { setTemplate(settings.defaultTemplate); setDirty(true); }
  };

  const VARS = [
    { label: '{{documentos}}', desc: 'Lista de documentos: nome, competência, vencimento e link' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-2">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Vigia — Acessórias</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Monitora e-mails do Acessórias e envia notificações WhatsApp para clientes com opt-in.
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wifi className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Status do monitoramento</span>
          </div>
          {status && <StatusBadge state={status.state} />}
        </div>

        {status && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Última execução" value={formatRelative(status.lastRunAt)} />
            <Stat label="Processados hoje" value={String(status.emailsProcessedToday)} />
            <Stat label="Ignorados hoje" value={String(status.emailsSkippedToday)} />
            <Stat
              label="Último erro"
              value={status.lastErrorAt ? formatRelative(status.lastErrorAt) : '—'}
              highlight={!!status.lastError}
            />
          </div>
        )}

        {status?.lastError && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 dark:bg-red-900/20">
            <p className="font-mono text-xs text-red-700 dark:text-red-400 break-all">{status.lastError}</p>
          </div>
        )}

        {(status?.state === 'error' || status?.state === 'disconnected') && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {reconnect.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              Reconectar IMAP
            </button>
          </div>
        )}
      </div>

      {/* Variables reference */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Variáveis disponíveis</p>
        <div className="space-y-1.5">
          {VARS.map((v) => (
            <div key={v.label} className="flex items-baseline gap-3">
              <code
                className="cursor-pointer rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs text-zinc-800 hover:bg-primary/10 hover:text-primary dark:bg-zinc-700 dark:text-zinc-200"
                title="Clique para inserir"
                onClick={() => { setTemplate((t) => t + v.label); setDirty(true); }}
              >
                {v.label}
              </code>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{v.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Template editor */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Template da mensagem</label>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : (
          <textarea
            rows={10}
            value={template}
            onChange={(e) => { setTemplate(e.target.value); setDirty(true); }}
            className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder="Digite o template..."
          />
        )}
      </div>

      {/* Preview */}
      {template && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Prévia (exemplo)</p>
          <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {template.replace(
              /\{\{documentos\}\}/g,
              'GUIA DARF: 07/2026 - Vencimento em: 19/08/2026\n«Clique aqui para acessar» → https://app.acessorias.com/getguia.php?ko=exemplo1\n\nFGTS: 07/2026\n«Clique aqui para acessar» → https://app.acessorias.com/getguia.php?ko=exemplo2',
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar padrão
        </button>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium tabular-nums ${highlight ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
        {value}
      </p>
    </div>
  );
}
