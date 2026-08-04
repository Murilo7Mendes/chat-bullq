'use client';

import { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { Save, Play, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { nodeTypes } from './nodes/custom-nodes';
import { NodeToolbar } from './node-toolbar';
import { NodePropertiesPanel } from './node-properties-panel';
import { ChatSimulator } from './chat-simulator';
import { chatbotService, type ChatbotFlow, type ChatbotNode } from '../services/chatbot.service';

interface FlowEditorProps {
  flow: ChatbotFlow;
}

function flowNodesToReactFlow(nodes: ChatbotNode[]): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.positionX, y: n.positionY },
    data: n.data,
  }));

  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    for (let i = 0; i < n.edges.length; i++) {
      const e = n.edges[i];
      rfEdges.push({
        id: `${n.id}-${e.targetNodeId}-${i}`,
        source: n.id,
        target: e.targetNodeId,
        sourceHandle: n.type === 'MENU' || n.type === 'CONDITION' ? `output-${i}` : 'output-0',
        label: e.condition || undefined,
        animated: true,
        style: { strokeWidth: 2 },
      });
    }
  }

  return { nodes: rfNodes, edges: rfEdges };
}

function reactFlowToApiNodes(nodes: Node[], edges: Edge[]): Omit<ChatbotNode, 'id' | 'flowId'>[] {
  return nodes.map((n) => {
    const outEdges = edges
      .filter((e) => e.source === n.id)
      .map((e) => ({
        targetNodeId: e.target,
        condition: (e.label as string) || undefined,
      }));

    return {
      type: n.type || 'MESSAGE',
      name: null,
      positionX: n.position.x,
      positionY: n.position.y,
      data: (n.data || {}) as Record<string, any>,
      edges: outEdges,
    };
  });
}

export function FlowEditor({ flow }: FlowEditorProps) {
  const initial = flowNodesToReactFlow(flow.nodes);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const idCounter = useRef(100);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const handleAddNode = useCallback((type: string) => {
    idCounter.current++;
    const defaultData: Record<string, any> = {};
    if (type === 'MESSAGE') defaultData.message = '';
    if (type === 'MENU') { defaultData.title = ''; defaultData.options = [{ label: 'Opção 1', value: 'opt_1' }]; }
    if (type === 'CONDITION') { defaultData.variable = ''; defaultData.operator = 'equals'; defaultData.value = ''; }
    if (type === 'WAIT') { defaultData.prompt = ''; defaultData.saveAs = 'lastInput'; }
    if (type === 'TRANSFER') defaultData.message = 'Transferindo para um atendente...';

    const newNode: Node = {
      id: `new_${idCounter.current}`,
      type,
      position: { x: 250 + Math.random() * 100, y: 200 + Math.random() * 100 },
      data: defaultData,
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleUpdateNodeData = useCallback((id: string, data: Record<string, any>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    setSelectedNode((prev) => (prev?.id === id ? { ...prev, data } : prev));
  }, [setNodes]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const apiNodes = reactFlowToApiNodes(nodes, edges);
      await chatbotService.saveNodes(flow.id, apiNodes);
      toast.success('Fluxo salvo!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.4))] flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <Link href="/chatbot" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{flow.name}</h1>
            <p className="text-[10px] text-zinc-400">{flow.nodes.length} nós · {flow.isActive ? 'Ativo' : 'Inativo'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <Play className="h-3.5 w-3.5" /> Simular
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> Salvar
          </button>
        </div>
      </div>

      <div className="relative flex flex-1">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode="Delete"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
              className="!rounded-xl !border !border-zinc-200 dark:!border-zinc-700"
            />
          </ReactFlow>
          <NodeToolbar onAddNode={handleAddNode} />
          {showSimulator && (
            <ChatSimulator
              nodes={nodes}
              edges={edges}
              onClose={() => setShowSimulator(false)}
            />
          )}
        </div>
        {selectedNode && (
          <NodePropertiesPanel
            node={selectedNode}
            onUpdate={handleUpdateNodeData}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
