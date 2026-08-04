'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search, Check, Forward } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  inboxService,
  type Conversation,
  type ChannelInfo,
  type Message,
} from '../services/inbox.service';
import { channelsService, type Channel } from '@/features/channels/services/channels.service';
import { ZappfyIcon, MetaIcon } from '@/components/ui/icons';

/** Só WhatsApp pode ser destino de encaminhamento. */
const WHATSAPP_TYPES = ['WHATSAPP_ZAPPFY', 'WHATSAPP_OFFICIAL'] as const;
const isWhatsapp = (type: string) =>
  (WHATSAPP_TYPES as readonly string[]).includes(type);

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
};

/** Linha de preview da mensagem sendo encaminhada — espelha os rótulos do backend. */
function forwardPreview(message: Message): string {
  const c = (message.content ?? {}) as Record<string, any>;
  switch (message.type) {
    case 'TEXT':
      return typeof c.text === 'string' ? c.text : '';
    case 'IMAGE':
      return c.caption ? `[imagem] ${c.caption}` : '[imagem]';
    case 'VIDEO':
      return c.caption ? `[vídeo] ${c.caption}` : '[vídeo]';
    case 'AUDIO':
      return '[áudio]';
    case 'STICKER':
      return '[figurinha]';
    case 'DOCUMENT':
      return typeof c.fileName === 'string' && c.fileName ? c.fileName : '[documento]';
    case 'LOCATION':
      return '[localização]';
    default:
      return typeof c.text === 'string' && c.text ? c.text : `[${message.type.toLowerCase()}]`;
  }
}

function MiniAvatar({ name, avatarUrl }: { name?: string | null; avatarUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '??').slice(0, 2).toUpperCase();
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-700"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
      {initials}
    </div>
  );
}

interface Props {
  message: Message | null;
  /** Canal de origem — usado como default do canal ao digitar número novo. */
  originChannel: ChannelInfo;
  onClose: () => void;
}

export function ForwardMessageDialog({ message, originChannel, onClose }: Props) {
  const open = !!message;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newPhone, setNewPhone] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [sending, setSending] = useState(false);

  // Reset ao (re)abrir.
  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setSelected(new Set());
      setNewPhone('');
      setNewChannelId('');
    }
  }, [open, message?.id]);

  // Debounce da busca (mesmo padrão da conversation-list).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Escape + trava o scroll do body, igual ao new-conversation-dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, sending]);

  const { data: conversationsData, isLoading: loadingConversations } = useQuery({
    queryKey: ['forward-conversations', debouncedSearch],
    queryFn: () =>
      inboxService.getConversations(
        debouncedSearch ? { search: debouncedSearch } : undefined,
      ),
    enabled: open,
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsService.list,
    enabled: open,
  });

  // Só conversas WhatsApp podem receber encaminhamento.
  const conversations = useMemo(
    () =>
      (conversationsData?.conversations ?? []).filter((c: Conversation) =>
        isWhatsapp(c.channel.type),
      ),
    [conversationsData],
  );

  const whatsappChannels = useMemo(
    () => (channels ?? []).filter((c: Channel) => isWhatsapp(c.type)),
    [channels],
  );

  // Default do canal pra número novo: o de origem se for WhatsApp, senão o 1º.
  useEffect(() => {
    if (!open || newChannelId) return;
    const fallback = whatsappChannels[0]?.id;
    setNewChannelId(isWhatsapp(originChannel.type) ? originChannel.id : fallback || '');
  }, [open, whatsappChannels, originChannel, newChannelId]);

  if (!open || !message) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const newNumberValid = newPhone.trim().replace(/\D/g, '').length >= 8 && !!newChannelId;
  const canSubmit = (selected.size > 0 || newNumberValid) && !sending;
  const totalTargets = selected.size + (newNumberValid ? 1 : 0);

  const handleForward = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const result = await inboxService.forwardMessage({
        messageId: message.id,
        conversationIds: selected.size > 0 ? Array.from(selected) : undefined,
        contacts: newNumberValid
          ? [{ channelId: newChannelId, phone: newPhone.trim().replace(/\D/g, '') }]
          : undefined,
      });

      const sentCount = result.sent?.length ?? 0;
      const failedCount = result.failed?.length ?? 0;
      if (sentCount > 0 && failedCount === 0) {
        toast.success(
          sentCount === 1 ? 'Mensagem encaminhada' : `Encaminhada para ${sentCount} conversas`,
        );
      } else if (sentCount > 0) {
        toast.warning(
          `Encaminhada para ${sentCount}, falhou em ${failedCount}: ${result.failed
            .map((f) => f.reason)
            .join('; ')}`,
        );
      }
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Erro ao encaminhar mensagem',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !sending && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Forward className="h-4 w-4" />
            Encaminhar
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview do que está sendo encaminhado. */}
        <div className="border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Mensagem
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-200">
            {forwardPreview(message) || '(sem texto)'}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* Número novo */}
          <div>
            <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              Encaminhar para um número novo
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                disabled={sending}
                placeholder="5511999999999"
                className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <select
                value={newChannelId}
                onChange={(e) => setNewChannelId(e.target.value)}
                disabled={sending || whatsappChannels.length === 0}
                className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                title="Canal de envio"
              >
                {whatsappChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
            <span className="text-[11px] text-zinc-400">ou escolha conversas</span>
            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
          </div>

          {/* Busca de conversas */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={sending}
              placeholder="Buscar conversa..."
              className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="space-y-0.5">
            {loadingConversations ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : conversations.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                Nenhuma conversa WhatsApp encontrada.
              </p>
            ) : (
              conversations.map((conv) => {
                const isSelected = selected.has(conv.id);
                const ChannelIcon = channelIcons[conv.channel.type];
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => toggle(conv.id)}
                    disabled={sending}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:opacity-50 ${
                      isSelected
                        ? 'bg-primary/[0.08] dark:bg-primary/15'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <MiniAvatar name={conv.contact.name} avatarUrl={conv.contact.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {conv.contact.name || conv.contact.phone || 'Sem nome'}
                      </p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-zinc-400">
                        {ChannelIcon && <ChannelIcon className="h-3 w-3" />}
                        {conv.channel.name}
                      </p>
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-white'
                          : 'border-zinc-300 text-transparent dark:border-zinc-600'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleForward}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 className="h-3 w-3 animate-spin" />}
            Encaminhar{totalTargets > 0 ? ` (${totalTargets})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
