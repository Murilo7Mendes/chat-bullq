'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { channelsService, type Channel } from '../services/channels.service';

interface EditChannelDialogProps {
  channel: Channel | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

/**
 * Pre-fills with the channel's current credentials so the operator can
 * audit/correct without needing to recreate. All credential inputs use
 * type="text" — JP needs the values visible to compare against the
 * provider's dashboard. This trades shoulder-surfing risk for ergonomics.
 */
export function EditChannelDialog({
  channel,
  onClose,
  onSaved,
}: EditChannelDialogProps) {
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);

  // Evolution QR state
  const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'qr' | 'open' | 'error'>('idle');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchQr = useCallback(async (channelId: string) => {
    setQrStatus('loading');
    try {
      const res = await channelsService.evolutionConnect(channelId);
      if (res.status === 'open') {
        setQrStatus('open');
        setQrBase64(null);
        stopPolling();
        return;
      }
      if (res.qrBase64) {
        setQrBase64(res.qrBase64);
        setQrStatus('qr');
        // Poll again in 20s — QR expires after ~60s
        pollRef.current = setTimeout(() => fetchQr(channelId), 20_000);
      } else if (res.status === 'connecting') {
        // Baileys still initializing — retry in 4s
        setQrStatus('loading');
        pollRef.current = setTimeout(() => fetchQr(channelId), 4_000);
      } else {
        setQrStatus('error');
      }
    } catch {
      setQrStatus('error');
    }
  }, [stopPolling]);

  // Auto-start QR polling when dialog opens for an Evolution channel
  useEffect(() => {
    if (channel?.type === 'WHATSAPP_EVOLUTION') {
      fetchQr(channel.id);
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    // Coerce nested values to string for the form. Booleans/numbers are
    // re-typed on save when needed (none of the WhatsApp configs use them).
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(channel.config ?? {})) {
      flat[k] = v == null ? '' : String(v);
    }
    setConfig(flat);
    setWebhookSecret(channel.webhookSecret ?? '');
  }, [channel]);

  if (!channel) return null;

  const fields = fieldsFor(channel.type);

  const setField = (k: string, v: string) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      // Keep keys present in the original config but allow updating only
      // the fields the form exposes — preserves anything bespoke.
      const merged = { ...channel.config, ...config };
      // Remove empty optional keys to avoid storing literal "".
      for (const f of fields) {
        if (f.optional && !merged[f.key]?.trim()) {
          delete merged[f.key];
        }
      }
      await channelsService.update(channel.id, {
        name: name.trim(),
        config: merged,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      toast.success('Credenciais atualizadas');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Editar credenciais
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {channel.type.replace('_', ' ').toLowerCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {channel.type === 'WHATSAPP_EVOLUTION' && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Conexão WhatsApp
              </p>
              {qrStatus !== 'open' && (
                <button
                  type="button"
                  onClick={() => fetchQr(channel.id)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
              )}
            </div>

            {qrStatus === 'open' && (
              <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Conectado</span>
              </div>
            )}

            {qrStatus === 'loading' && (
              <div className="mt-3 flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            )}

            {qrStatus === 'qr' && qrBase64 && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <img
                  src={qrBase64}
                  alt="QR Code WhatsApp"
                  className="h-52 w-52 rounded-lg border border-zinc-200 dark:border-zinc-700"
                  style={{ imageRendering: 'pixelated' }}
                />
                <p className="text-center text-xs text-zinc-500">
                  Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                </p>
              </div>
            )}

            {qrStatus === 'error' && (
              <p className="mt-3 text-xs text-red-500">
                Não foi possível obter o QR code. Verifique a conexão com a Evolution API.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Nome do canal</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls.replace(' font-mono', '')}
            />
          </div>

          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className={labelCls}>
                {f.label}{' '}
                {f.optional && <span className="text-zinc-400">(opcional)</span>}
              </label>
              <input
                type="text"
                value={config[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className={inputCls}
              />
              {f.hint && (
                <p className="text-[11px] text-zinc-500">{f.hint}</p>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <label className={labelCls}>
              Webhook Secret <span className="text-zinc-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  optional?: boolean;
}

/** Field set per channel type — mirrors create-channel-dialog. */
function fieldsFor(type: Channel['type']): FieldDef[] {
  if (type === 'WHATSAPP_OFFICIAL') {
    return [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'Encontrado no Meta Business Suite' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'System User Token ou Temporary Token' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app (Settings → Basic na Meta)' },
      { key: 'businessAccountId', label: 'Business Account ID (WABA)', placeholder: 'Habilita auto-subscribe do webhook', optional: true },
    ];
  }
  if (type === 'WHATSAPP_ZAPPFY') {
    return [
      { key: 'token', label: 'Token', placeholder: 'Token da instância Zappfy' },
    ];
  }
  if (type === 'INSTAGRAM') {
    return [
      { key: 'accessToken', label: 'Access Token', placeholder: 'Instagram User Access Token (IGAAN...)' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app' },
      { key: 'igBusinessId', label: 'Instagram Business ID', placeholder: 'Detectado automaticamente', optional: true },
      { key: 'igAppId', label: 'Instagram App ID', optional: true },
    ];
  }
  if (type === 'GMAIL') {
    return [
      { key: 'email', label: 'Email da caixa', placeholder: 'atendimento@suaempresa.com' },
      { key: 'refreshToken', label: 'Refresh Token', placeholder: 'OAuth refresh_token da caixa (1//0g...)' },
      { key: 'sendMode', label: 'Modo de envio', placeholder: 'send ou draft', hint: '"send" envia direto; "draft" cria rascunho pra revisão humana', optional: true },
    ];
  }
  if (type === 'WHATSAPP_EVOLUTION') {
    return [
      { key: 'instanceName', label: 'Nome da instância', placeholder: 'Ex: bullq-wa' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Chave global da Evolution API' },
      { key: 'baseUrl', label: 'URL do servidor', placeholder: 'http://evolution:8080', optional: true },
    ];
  }
  return [];
}
