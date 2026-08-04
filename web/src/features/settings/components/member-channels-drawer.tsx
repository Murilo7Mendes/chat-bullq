'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Lock, X, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { channelsService, type Channel } from '@/features/channels/services/channels.service';
import { channelAccessService } from '@/features/settings/services/channel-access.service';

interface Props {
  open: boolean;
  onClose: () => void;
  member: { id: string; name: string; role: 'OWNER' | 'ADMIN' | 'AGENT' } | null;
  onSaved?: () => void;
}

/**
 * Drawer de gerenciar canais por membro.
 *
 * Regras de visibilidade reproduzidas no UI (espelho do ChannelAccessService):
 * - OWNER/ADMIN: veem todos os canais ORG por herança (mostrados como
 *                "Herdado", read-only) + precisam de grant explícito pra
 *                cada PRIVATE (toggleable). Owner NÃO é exceção: canal
 *                privado exige grant até pra ele.
 * - AGENT: nada por herança — todos os canais são toggleable.
 *
 * A lista de canais é a que o CALLER enxerga. Canal privado de outro membro
 * não aparece aqui e o backend também não deixa concedê-lo — quem libera é
 * quem já tem acesso a ele.
 */
export function MemberChannelsDrawer({ open, onClose, member, onSaved }: Props) {
  const inheritsOrgChannels =
    member?.role === 'OWNER' || member?.role === 'ADMIN';
  const enabled = open && !!member;

  const { data: channels, isLoading: loadingChannels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
    enabled: open,
  });

  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ['member-channels', member?.id],
    queryFn: () => channelAccessService.listMemberChannels(member!.id),
    enabled,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Troca de membro zera a seleção: enquanto o GET do novo está em voo,
  // `selected` ainda guardaria o que foi marcado pro anterior — e um Salvar
  // apressado gravaria os canais de um no outro.
  useEffect(() => {
    setSelected(new Set());
  }, [member?.id]);

  useEffect(() => {
    if (access) setSelected(new Set(access.channelIds));
  }, [access]);

  // Pre-split por visibility quando o membro herda os ORG (OWNER/ADMIN) —
  // esses ficam read-only e só os PRIVATE são toggleable.
  const { inherited, toggleable } = useMemo(() => {
    if (!channels || !member) {
      return { inherited: [] as Channel[], toggleable: [] as Channel[] };
    }
    if (inheritsOrgChannels) {
      return {
        inherited: channels.filter((c) => c.visibility !== 'PRIVATE'),
        toggleable: channels.filter((c) => c.visibility === 'PRIVATE'),
      };
    }
    // AGENT: todos toggleable
    return { inherited: [] as Channel[], toggleable: channels };
  }, [channels, member, inheritsOrgChannels]);

  if (!open || !member) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Substitui só o que está marcável nesta tela e devolve intactos os
      // grants que ela não edita — pra OWNER/ADMIN são os grants em canal
      // ORG (herança já cobre, mas apagá-los seria perda silenciosa de
      // dado, e eles voltam a valer se o canal virar PRIVATE).
      const toggleableIds = new Set(toggleable.map((c) => c.id));
      const untouched = (access?.channelIds ?? []).filter(
        (id) => !toggleableIds.has(id),
      );
      const toPersist = [
        ...new Set([
          ...untouched,
          ...[...selected].filter((id) => toggleableIds.has(id)),
        ]),
      ];
      await channelAccessService.setMemberChannels(member.id, toPersist);
      toast.success('Canais atualizados');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = member.role === 'OWNER' ? 'Proprietário' : 'Admin';
  const headerSubtitle = inheritsOrgChannels
    ? `${roleLabel} enxerga todos os canais públicos automaticamente. Pra canais privados, é preciso liberar acesso individualmente.`
    : 'Marque os canais que este agente pode ver e atender.';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-zinc-900">
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Canais de {member.name}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">{headerSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingChannels || loadingAccess ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : !channels?.length ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Nenhum canal configurado nesta organização.
            </div>
          ) : (
            <div className="space-y-5">
              {inherited.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <Globe className="h-3 w-3" /> Herdados (acesso automático)
                  </h4>
                  <ul className="space-y-1">
                    {inherited.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 rounded-md px-3 py-2 opacity-80"
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 bg-zinc-100 text-[9px] text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800">
                          ✓
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            {c.type} · canal público
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {toggleable.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {inheritsOrgChannels ? (
                      <>
                        <Lock className="h-3 w-3" /> Privados (precisa liberar)
                      </>
                    ) : (
                      'Canais'
                    )}
                  </h4>
                  <ul className="space-y-1">
                    {toggleable.map((c) => {
                      const checked = selected.has(c.id);
                      return (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(c.id)}
                              className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {c.name}
                              </p>
                              <p className="flex items-center gap-1 text-[11px] text-zinc-400">
                                {c.type}
                                {c.visibility === 'PRIVATE' && (
                                  <span className="inline-flex items-center gap-0.5 rounded-sm bg-zinc-100 px-1 text-[10px] dark:bg-zinc-800">
                                    <Lock className="h-2.5 w-2.5" /> privado
                                  </span>
                                )}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {inheritsOrgChannels && toggleable.length === 0 && (
                <p className="text-xs text-zinc-500">
                  Nenhum canal privado que você possa liberar. Canal privado
                  de outro membro não aparece aqui — quem já tem acesso a ele
                  é quem libera.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            // Sem os grants atuais em mãos o save mandaria um conjunto
            // incompleto e apagaria o que ainda não chegou.
            disabled={saving || loadingAccess || loadingChannels}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </footer>
      </aside>
    </div>
  );
}
