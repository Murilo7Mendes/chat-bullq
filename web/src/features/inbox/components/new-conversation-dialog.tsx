'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, AlertTriangle, Search, UserPlus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxService, type Conversation } from '../services/inbox.service';
import {
  channelsService,
  type Channel,
  type WhatsAppTemplate,
} from '@/features/channels/services/channels.service';
import { contactsService, type Contact } from '@/features/contacts/services/contacts.service';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon } from '@/components/ui/icons';
import { Zap as EvolutionIcon } from 'lucide-react';

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  WHATSAPP_EVOLUTION: EvolutionIcon,
  INSTAGRAM: InstagramIcon,
  GMAIL: GmailIcon,
};

const channelLabels: Record<string, string> = {
  WHATSAPP_ZAPPFY: 'WhatsApp',
  WHATSAPP_OFFICIAL: 'WhatsApp Oficial',
  WHATSAPP_EVOLUTION: 'WhatsApp (Evolution)',
  INSTAGRAM: 'Instagram',
  GMAIL: 'Gmail',
};

function templateVarCount(template: WhatsAppTemplate | undefined): number {
  const body = template?.components.find((c) => c.type === 'BODY');
  const matches = (body?.text as string | undefined)?.match(/\{\{\d+\}\}/g);
  return matches?.length ?? 0;
}

function ContactAvatar({ contact }: { contact: Contact }) {
  const initials = (contact.name || contact.phone || '?').slice(0, 2).toUpperCase();
  if (contact.avatarUrl) {
    return (
      <img
        src={contact.avatarUrl}
        alt={contact.name || ''}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
      {initials}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}

export function NewConversationDialog({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();

  // ── canal ────────────────────────────────────────────────────────────────
  const [channelId, setChannelId] = useState('');

  // ── contato ──────────────────────────────────────────────────────────────
  const [contactQuery, setContactQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── mensagem ─────────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // ── queries ──────────────────────────────────────────────────────────────
  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsService.list,
    enabled: open,
  });

  const selectedChannel = useMemo(
    () => channels?.find((c) => c.id === channelId),
    [channels, channelId],
  );
  const channelType = selectedChannel?.type;
  const isGmail = channelType === 'GMAIL';
  const isOfficial = channelType === 'WHATSAPP_OFFICIAL';
  const isZappfy = channelType === 'WHATSAPP_ZAPPFY' || channelType === 'WHATSAPP_EVOLUTION';

  const { data: templates } = useQuery({
    queryKey: ['channel-templates', channelId],
    queryFn: () => channelsService.getTemplates(channelId),
    enabled: open && isOfficial && !!channelId,
  });

  const { data: contactResults, isFetching: searchingContacts } = useQuery({
    queryKey: ['contact-search-dialog', debouncedQuery],
    queryFn: () => contactsService.list({ search: debouncedQuery, limit: '8' }),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 5000,
  });

  const selectedTemplate = templates?.find((t) => t.name === templateName);
  const varCount = templateVarCount(selectedTemplate);

  // ── auto-seleciona primeiro canal ao carregar ────────────────────────────
  useEffect(() => {
    if (!channels?.length || channelId) return;
    const first = channels.find((c) => c.type !== 'INSTAGRAM');
    if (first) setChannelId(first.id);
  }, [channels, channelId]);

  // ── reset ao abrir ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setContactQuery('');
    setDebouncedQuery('');
    setSelectedContact(null);
    setSubject('');
    setMessageText('');
    setTemplateName('');
    setTemplateVars([]);
    setShowDropdown(false);
  }, [open]);

  useEffect(() => {
    setTemplateName('');
    setTemplateVars([]);
  }, [channelId]);

  useEffect(() => {
    setTemplateVars(Array(varCount).fill(''));
  }, [templateName, varCount]);

  // ── Escape fecha o dialog ─────────────────────────────────────────────
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

  // ── fecha dropdown ao clicar fora ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!open) return null;

  // ── handlers contato ─────────────────────────────────────────────────────
  const handleContactQueryChange = (value: string) => {
    setContactQuery(value);
    setSelectedContact(null);
    setShowDropdown(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setContactQuery(contact.name || contact.phone || contact.email || '');
    setShowDropdown(false);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setContactQuery('');
    setDebouncedQuery('');
    setShowDropdown(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── derivar phone/email/name para envio ──────────────────────────────────
  const resolvedPhone = selectedContact?.phone ?? (!isGmail ? contactQuery.trim() : '');
  const resolvedEmail = selectedContact?.email ?? (isGmail ? contactQuery.trim() : '');
  const resolvedName = selectedContact?.name ?? '';

  // ── validações ───────────────────────────────────────────────────────────
  const contactValid = isGmail
    ? resolvedEmail.length > 3
    : resolvedPhone.length >= 8;
  const messageValid = isOfficial
    ? !!templateName && templateVars.every((v) => v.trim().length > 0)
    : messageText.trim().length > 0;
  const canSubmit = !!channelId && contactValid && messageValid && !sending;

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const message = isOfficial
        ? {
            type: 'TEMPLATE' as const,
            content: {
              name: templateName,
              language: { code: selectedTemplate?.language ?? 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: templateVars.map((v) => ({
                    type: 'text',
                    text: v.trim() || '-',
                  })),
                },
              ],
            },
          }
        : { type: 'TEXT' as const, content: { text: messageText.trim() } };

      const sentMessage = await inboxService.startConversation({
        channelId,
        contact: {
          phone: isGmail ? undefined : resolvedPhone || undefined,
          email: isGmail ? resolvedEmail || undefined : undefined,
          name: resolvedName || undefined,
        },
        message,
        subject: isGmail ? subject.trim() || undefined : undefined,
      });

      const conversation = await inboxService.getConversation(sentMessage.conversationId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa iniciada');
      onCreated(conversation);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao iniciar conversa');
    } finally {
      setSending(false);
    }
  };

  const contacts = contactResults?.contacts ?? [];
  const showResults = showDropdown && debouncedQuery.length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !sending && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Nova conversa
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
          {/* Canal */}
          <div>
            <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              Canal
            </label>
            <div className="relative mt-1.5">
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={sending}
                className="w-full appearance-none rounded-md border border-zinc-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {!channels?.length && <option value="">Carregando...</option>}
                {channels?.map((c: Channel) => (
                  <option key={c.id} value={c.id} disabled={c.type === 'INSTAGRAM'}>
                    {channelLabels[c.type] ?? c.type} — {c.name}
                    {c.type === 'INSTAGRAM' ? ' (indisponível)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          {channelId && channelType !== 'INSTAGRAM' && (
            <>
              {/* Busca de contato */}
              <div ref={dropdownRef} className="relative">
                <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                  {isGmail ? 'Email ou nome do contato' : 'Telefone ou nome do contato'}
                </label>

                {selectedContact ? (
                  // Contato selecionado — exibe chip
                  <div className="mt-1.5 flex items-center gap-2.5 rounded-md border border-primary/50 bg-primary/5 px-3 py-2 dark:bg-primary/10">
                    <ContactAvatar contact={selectedContact} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedContact.name || selectedContact.phone || selectedContact.email}
                      </p>
                      {selectedContact.name && (selectedContact.phone || selectedContact.email) && (
                        <p className="truncate text-[11px] text-zinc-500">
                          {selectedContact.phone || selectedContact.email}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleClearContact}
                      className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  // Campo de busca
                  <div className="relative mt-1.5">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={contactQuery}
                      onChange={(e) => handleContactQueryChange(e.target.value)}
                      onFocus={() => contactQuery.length >= 2 && setShowDropdown(true)}
                      disabled={sending}
                      placeholder={isGmail ? 'cliente@exemplo.com ou nome...' : '5511999999999 ou nome...'}
                      autoFocus
                      className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    {searchingContacts && (
                      <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-zinc-400" />
                    )}

                    {/* Dropdown de resultados */}
                    {showResults && (
                      <div className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        {contacts.length > 0 ? (
                          <>
                            {contacts.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectContact(c)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                              >
                                <ContactAvatar contact={c} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    {c.name || c.phone || c.email || 'Sem nome'}
                                  </p>
                                  {c.name && (c.phone || c.email) && (
                                    <p className="truncate text-[11px] text-zinc-500">
                                      {c.phone || c.email}
                                    </p>
                                  )}
                                </div>
                              </button>
                            ))}
                            <div className="border-t border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
                              <p className="text-[11px] text-zinc-400">
                                Ou continue digitando para criar novo contato
                              </p>
                            </div>
                          </>
                        ) : !searchingContacts ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-500">
                            <UserPlus className="h-4 w-4 shrink-0 text-zinc-400" />
                            <span>
                              Nenhum contato encontrado — será criado ao iniciar
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Assunto (Gmail) */}
              {isGmail && (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Assunto (opcional)
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sending}
                    placeholder="Sem assunto = usa a 1ª linha da mensagem"
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              {/* Template ou mensagem livre */}
              {isOfficial ? (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Template aprovado
                  </label>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Fora da janela de 24h, a Meta exige um template HSM aprovado.
                  </p>
                  <select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    disabled={sending}
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">
                      {templates ? 'Selecione um template' : 'Carregando templates...'}
                    </option>
                    {templates?.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                  {templates && templates.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
                      Nenhum template aprovado encontrado pra esse canal.
                    </p>
                  )}
                  {templateVars.map((v, i) => (
                    <input
                      key={i}
                      type="text"
                      value={v}
                      onChange={(e) => {
                        const next = [...templateVars];
                        next[i] = e.target.value;
                        setTemplateVars(next);
                      }}
                      disabled={sending}
                      placeholder={`Variável {{${i + 1}}}`}
                      className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Mensagem
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    disabled={sending}
                    rows={4}
                    placeholder="Escreva a primeira mensagem..."
                    className="mt-1.5 w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              {isZappfy && (
                <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Contato frio em volume alto pode fazer o número levar bloqueio no WhatsApp — use com moderação.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 className="h-3 w-3 animate-spin" />}
            Iniciar conversa
          </button>
        </div>
      </div>
    </div>
  );
}
