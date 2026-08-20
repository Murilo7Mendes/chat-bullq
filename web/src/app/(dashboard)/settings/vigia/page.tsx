'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { vigiaService } from '@/features/vigia/services/vigia.service';

export default function VigiaSettingsPage() {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vigia-settings'],
    queryFn: () => vigiaService.getSettings(),
  });

  useEffect(() => {
    if (data && !dirty) setTemplate(data.messageTemplate);
  }, [data]);

  const save = useMutation({
    mutationFn: () => vigiaService.saveSettings(template),
    onSuccess: () => {
      toast.success('Template salvo');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['vigia-settings'] });
    },
    onError: () => toast.error('Erro ao salvar template'),
  });

  const reset = () => {
    if (data) { setTemplate(data.defaultTemplate); setDirty(true); }
  };

  const VARS = [
    { label: '{{assunto}}', desc: 'Assunto do e-mail recebido' },
    { label: '{{links}}', desc: 'Links do documento formatados' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-2">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Vigia — Mensagem padrão</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Texto enviado ao cliente quando um documento chega pelo Acessórias. Use as variáveis abaixo para personalizar.
        </p>
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
            {template
              .replace(/\{\{assunto\}\}/g, 'LUCRON CONTABILIDADE - Financeiro\n- GUIA DARF: 07/2026 - Vencimento: 19/08/2026')
              .replace(/\{\{links\}\}/g, '«Clique aqui para acessar» → https://app.acessorias.com/getguia.php?ko=exemplo')}
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
