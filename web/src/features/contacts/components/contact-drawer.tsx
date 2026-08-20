'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, Plus, Trash2, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { contactsService, type Contact } from '@/features/contacts/services/contacts.service';

interface Props {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
}

function formatCnpj(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}

function isValidCnpj(raw: string): boolean {
  return normalizeCnpj(raw).length === 14;
}

export function ContactDrawer({ open, onClose, contact }: Props) {
  const qc = useQueryClient();

  // ── form fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ── CNPJ add input ────────────────────────────────────────────────────────
  const [cnpjInput, setCnpjInput] = useState('');
  const [addingCnpj, setAddingCnpj] = useState(false);

  // ── reset when contact changes ────────────────────────────────────────────
  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? '');
    setPhone(contact.phone ?? '');
    setEmail(contact.email ?? '');
    setNotes(contact.notes ?? '');
    setDirty(false);
    setCnpjInput('');
  }, [contact?.id]);

  // ── CNPJs query ───────────────────────────────────────────────────────────
  const { data: cnpjs, isLoading: loadingCnpjs } = useQuery({
    queryKey: ['contact-cnpjs', contact?.id],
    queryFn: () => contactsService.listCnpjs(contact!.id),
    enabled: open && !!contact,
  });

  // ── mutations ─────────────────────────────────────────────────────────────
  const invalidateCnpjs = () => qc.invalidateQueries({ queryKey: ['contact-cnpjs', contact?.id] });

  const toggleNotify = useMutation({
    mutationFn: ({ cnpj, autoNotify }: { cnpj: string; autoNotify: boolean }) =>
      contactsService.updateCnpjAutoNotify(contact!.id, cnpj, autoNotify),
    onSuccess: invalidateCnpjs,
    onError: () => toast.error('Erro ao atualizar notificação'),
  });

  const deleteCnpj = useMutation({
    mutationFn: (cnpj: string) => contactsService.removeCnpj(contact!.id, cnpj),
    onSuccess: invalidateCnpjs,
    onError: () => toast.error('Erro ao remover CNPJ'),
  });

  if (!open || !contact) return null;

  // ── save basic fields ─────────────────────────────────────────────────────
  const save = async () => {
    if (!dirty) { onClose(); return; }
    setSaving(true);
    try {
      await contactsService.update(contact.id, { name, phone, email, notes });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contato atualizado');
      setDirty(false);
      onClose();
    } catch {
      toast.error('Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  // ── add CNPJ ──────────────────────────────────────────────────────────────
  const addCnpj = async () => {
    if (!isValidCnpj(cnpjInput)) {
      toast.error('CNPJ inválido — informe 14 dígitos');
      return;
    }
    setAddingCnpj(true);
    try {
      await contactsService.addCnpj(contact.id, normalizeCnpj(cnpjInput));
      await invalidateCnpjs();
      setCnpjInput('');
      toast.success('CNPJ vinculado');
    } catch {
      toast.error('Erro ao vincular CNPJ');
    } finally {
      setAddingCnpj(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; rows?: number },
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {opts?.rows ? (
        <textarea
          rows={opts.rows}
          value={value}
          onChange={(e) => { onChange(e.target.value); setDirty(true); }}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 resize-none"
        />
      ) : (
        <input
          type={opts?.type ?? 'text'}
          value={value}
          onChange={(e) => { onChange(e.target.value); setDirty(true); }}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-zinc-900">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {contact.name || 'Sem nome'}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">Editar dados e CNPJs vinculados</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Basic fields */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Dados básicos</h4>
            {field('Nome', name, setName)}
            {field('Telefone', phone, setPhone, { type: 'tel' })}
            {field('E-mail', email, setEmail, { type: 'email' })}
            {field('Observações', notes, setNotes, { rows: 3 })}
          </section>

          {/* CNPJ section */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CNPJs vinculados</h4>

            {loadingCnpjs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              </div>
            ) : cnpjs && cnpjs.length > 0 ? (
              <ul className="space-y-1">
                {cnpjs.map((cc) => (
                  <li key={cc.id} className="flex items-center gap-2 rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <span className="flex-1 font-mono text-sm text-zinc-800 dark:text-zinc-200">
                      {formatCnpj(cc.cnpj)}
                    </span>
                    <button
                      title={cc.autoNotify ? 'Notificação ativa — clique para desativar' : 'Notificação inativa — clique para ativar'}
                      onClick={() => toggleNotify.mutate({ cnpj: cc.cnpj, autoNotify: !cc.autoNotify })}
                      className={`rounded p-1 transition-colors ${
                        cc.autoNotify
                          ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                          : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {cc.autoNotify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    </button>
                    <button
                      title="Remover CNPJ"
                      onClick={() => deleteCnpj.mutate(cc.cnpj)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-400">Nenhum CNPJ vinculado.</p>
            )}

            {/* Add CNPJ */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="00.000.000/0000-00 ou 14 dígitos"
                value={cnpjInput}
                onChange={(e) => setCnpjInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCnpj()}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                onClick={addCnpj}
                disabled={addingCnpj || !cnpjInput}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {addingCnpj ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Vincular
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Ative o sino <Bell className="inline h-3 w-3" /> para receber notificações automáticas do Vigia quando documentos deste CNPJ chegarem.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {dirty ? 'Salvar' : 'Fechar'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
