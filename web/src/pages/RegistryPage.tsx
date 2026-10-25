import React, { useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  fetchInstitutions,
  fetchTrustGraph,
  registerInstitutionBackend,
  approveInstitutionBackend,
  updateInstitutionStatusBackend,
  AppConfig,
  fetchConfig,
  FALLBACK_CONFIG,
} from '../lib/api';
import {
  Network,
  Table as TableIcon,
  PlusCircle,
  Building2,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const RegistryPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  // Registration Stepper State
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [registerName, setRegisterName] = useState<string>('Stanford University');
  const [registerDid, setRegisterDid] = useState<string>('did:trustmesh:stanford');
  const [registerStep, setRegisterStep] = useState<number>(1);
  const [registeredId, setRegisteredId] = useState<string>('');
  const [regTx1, setRegTx1] = useState<string>('');
  const [regTx2, setRegTx2] = useState<string>('');
  const [regTx3, setRegTx3] = useState<string>('');
  const [regLoading, setRegLoading] = useState<boolean>(false);

  useEffect(() => {
    loadRegistry();
  }, []);

  const loadRegistry = async () => {
    const [insts, graph] = await Promise.all([
      fetchInstitutions(),
      fetchTrustGraph(),
    ]);
    setInstitutions(insts);
    setGraphData(graph);
  };

  // Convert raw graph nodes to ReactFlow nodes
  const flowNodes: Node[] = graphData.nodes.map((n, idx) => {
    let bg = 'bg-surface-card border-surface-border text-surface-text';
    let icon = <Building2 className="h-4 w-4 text-brand-400" />;

    if (n.kind === 'accreditor') {
      bg = 'bg-blue-500/10 border-blue-500/40 text-blue-300';
      icon = <ShieldCheck className="h-4 w-4 text-blue-400" />;
    } else if (n.kind === 'key') {
      bg = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
      icon = <Key className="h-4 w-4 text-emerald-400" />;
    } else if (n.kind === 'guardian') {
      bg = 'bg-purple-500/10 border-purple-500/40 text-purple-300';
      icon = <Lock className="h-4 w-4 text-purple-400" />;
    }

    // Grid layout coordinates
    const col =
      n.kind === 'accreditor' ? 80 : n.kind === 'institution' ? 380 : 680;
    const row = 80 + (idx % 4) * 110;

    return {
      id: n.id,
      position: { x: col, y: row },
      data: {
        label: (
          <div className="flex items-center space-x-2 text-xs font-semibold">
            {icon}
            <span>{n.label}</span>
          </div>
        ),
        raw: n,
      },
      className: `rounded-2xl border-2 p-3 shadow-lg backdrop-blur-md cursor-pointer transition-transform hover:scale-105 ${bg}`,
    };
  });

  const flowEdges: Edge[] = graphData.edges.map((e, idx) => ({
    id: `e-${idx}`,
    source: e.from,
    target: e.to,
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
  }));

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedNode(node.data?.raw || null);
  };

  // 3-Step Registration Flow
  const handleStep1Register = async () => {
    setRegLoading(true);
    try {
      const res = await registerInstitutionBackend({
        name: registerName,
        did: registerDid,
      });
      setRegisteredId(res.id);
      setRegTx1(res.txHash);
      setRegisterStep(2);
      toast.success('Institution registered on-chain! Needs 2 accreditor approvals');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  };

  const handleStep2Approve1 = async () => {
    setRegLoading(true);
    try {
      const res = await approveInstitutionBackend(registeredId, 0);
      setRegTx2(res.txHash);
      setRegisterStep(3);
      toast.success('Accreditor Alpha (idx-0) approved! Approvals: 1/2');
    } catch (err: any) {
      toast.error(err.message || 'Accreditor 1 approval failed');
    } finally {
      setRegLoading(false);
    }
  };

  const handleStep3Approve2 = async () => {
    setRegLoading(true);
    try {
      const res = await approveInstitutionBackend(registeredId, 1);
      setRegTx3(res.txHash);
      setRegisterStep(4);
      toast.success('Accreditor Beta (idx-1) approved! Institution is now ACTIVE ✔');
      loadRegistry();
    } catch (err: any) {
      toast.error(err.message || 'Accreditor 2 approval failed');
    } finally {
      setRegLoading(false);
    }
  };

  const handleStatusChange = async (
    instId: string,
    action: 'suspend' | 'reinstate' | 'revoke'
  ) => {
    try {
      const res = await updateInstitutionStatusBackend(instId, action);
      toast.success(`Institution status updated: ${action.toUpperCase()}`);
      loadRegistry();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Network className="h-7 w-7 text-brand-400" />
            <h1 className="text-3xl font-black tracking-tight text-surface-text">
              Trust Registry & Graph
            </h1>
          </div>
          <p className="mt-1 text-sm text-surface-muted max-w-2xl">
            Interactive topological trust graph showing Accreditors &rarr;
            Institutions &rarr; Active Signer Keys & Guardians. Strict 2-of-3
            multi-signature accreditation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex rounded-xl border border-surface-border bg-surface-card p-1">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'graph'
                  ? 'bg-brand-500 text-white'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              <span>Interactive Graph</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-brand-500 text-white'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table View</span>
            </button>
          </div>

          <button
            onClick={() => {
              setRegisterStep(1);
              setShowRegisterModal(true);
            }}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Register Institution</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'graph' ? (
        <div className="relative h-[560px] w-full rounded-3xl border border-surface-border bg-surface-card overflow-hidden shadow-xl">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodeClick={handleNodeClick}
            fitView
          >
            <Background color="#334155" gap={20} size={1} />
            <Controls className="bg-surface-card border-surface-border fill-surface-text" />
          </ReactFlow>

          {/* Node Inspector Drawer */}
          {selectedNode && (
            <div className="absolute right-4 top-4 z-10 w-80 rounded-2xl border border-surface-border bg-surface-card/95 p-5 shadow-2xl backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-2">
                <span className="text-xs font-bold uppercase text-surface-muted">
                  Node Inspector
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-xs text-surface-muted hover:text-surface-text"
                >
                  ✕
                </button>
              </div>

              <div>
                <h4 className="text-sm font-bold text-surface-text">
                  {selectedNode.label}
                </h4>
                <div className="text-[11px] font-mono text-brand-400 capitalize">
                  Type: {selectedNode.kind}
                </div>
              </div>

              <div className="rounded-xl bg-surface-base p-3 font-mono text-xs text-surface-muted border border-surface-border space-y-1">
                <div>ID: {selectedNode.id}</div>
                <div>Status: {selectedNode.status === 1 ? 'ACTIVE' : 'INACTIVE'}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-surface-border bg-surface-card overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="border-b border-surface-border bg-surface-base text-[11px] font-bold uppercase tracking-wider text-surface-muted">
                <tr>
                  <th className="px-4 py-3.5">Institution Name & DID</th>
                  <th className="px-4 py-3.5">Admin Address</th>
                  <th className="px-4 py-3.5">Accreditor Approvals</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Signer Keys</th>
                  <th className="px-4 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border font-mono">
                {institutions.map((inst) => (
                  <tr
                    key={inst.id || inst.did}
                    className="hover:bg-surface-elevated/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-sans">
                      <div className="font-bold text-surface-text">
                        {inst.name || inst.did}
                      </div>
                      <div className="text-[11px] font-mono text-surface-muted">
                        {inst.did}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-surface-muted">
                      {inst.admin?.slice(0, 12)}...
                    </td>

                    <td className="px-4 py-3.5 text-xs font-bold text-surface-text">
                      {inst.approvals || 2} / 2 Required
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 font-mono">
                        Active
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-surface-muted">
                      {inst.keys?.length || 1} active key(s)
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex space-x-1.5 font-sans">
                        <button
                          onClick={() => handleStatusChange(inst.id, 'suspend')}
                          className="rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] font-bold text-amber-400 hover:bg-amber-500/10"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => handleStatusChange(inst.id, 'revoke')}
                          className="rounded-lg border border-rose-500/30 px-2 py-1 text-[11px] font-bold text-rose-400 hover:bg-rose-500/10"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3-Step Registration Stepper Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-3xl border border-surface-border bg-surface-card p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-brand-400" />
                <h3 className="text-base font-bold text-surface-text">
                  2-of-3 Accreditor Institution Registration
                </h3>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-surface-muted hover:text-surface-text"
              >
                ✕
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div className="flex items-center justify-between px-2 text-xs font-mono font-bold">
              <div
                className={`flex items-center space-x-1 ${
                  registerStep >= 1 ? 'text-brand-400' : 'text-surface-muted'
                }`}
              >
                <span>1. Submit</span>
              </div>
              <ChevronRight className="h-4 w-4 text-surface-border" />
              <div
                className={`flex items-center space-x-1 ${
                  registerStep >= 2 ? 'text-brand-400' : 'text-surface-muted'
                }`}
              >
                <span>2. Accreditor 1</span>
              </div>
              <ChevronRight className="h-4 w-4 text-surface-border" />
              <div
                className={`flex items-center space-x-1 ${
                  registerStep >= 3 ? 'text-brand-400' : 'text-surface-muted'
                }`}
              >
                <span>3. Accreditor 2</span>
              </div>
            </div>

            {/* Step 1: Submit Details */}
            {registerStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Institution Name
                  </label>
                  <input
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Institution DID
                  </label>
                  <input
                    type="text"
                    value={registerDid}
                    onChange={(e) => setRegisterDid(e.target.value)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={handleStep1Register}
                  disabled={regLoading}
                  className="w-full rounded-xl bg-brand-500 py-3 text-xs font-bold text-white shadow-md hover:bg-brand-600 transition-colors"
                >
                  {regLoading ? 'Registering...' : 'Register on Chain (Admin Tx)'}
                </button>
              </div>
            )}

            {/* Step 2: First Accreditor Approval */}
            {registerStep === 2 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 text-xs font-mono space-y-1">
                  <div>Registration Tx: {regTx1.slice(0, 16)}...</div>
                  <div>Institution ID: {registeredId.slice(0, 16)}...</div>
                  <div className="text-amber-400 font-bold">
                    Pending Approval: 0 / 2
                  </div>
                </div>
                <button
                  onClick={handleStep2Approve1}
                  disabled={regLoading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-md hover:bg-blue-500 transition-colors"
                >
                  {regLoading
                    ? 'Submitting Signer Tx...'
                    : 'Approve as Accreditor Alpha (idx-0)'}
                </button>
              </div>
            )}

            {/* Step 3: Second Accreditor Approval */}
            {registerStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs font-mono space-y-1">
                  <div>Accreditor 1 Tx: {regTx2.slice(0, 16)}...</div>
                  <div className="text-emerald-400 font-bold">
                    Approvals: 1 / 2 (Threshold almost met)
                  </div>
                </div>
                <button
                  onClick={handleStep3Approve2}
                  disabled={regLoading}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition-colors"
                >
                  {regLoading
                    ? 'Finalizing Activation...'
                    : 'Approve as Accreditor Beta (idx-1) -> Activate'}
                </button>
              </div>
            )}

            {/* Step 4: Success Complete */}
            {registerStep === 4 && (
              <div className="text-center space-y-4 py-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="text-base font-bold text-surface-text">
                  Institution Fully Accredited & Activated!
                </h4>
                <p className="text-xs text-surface-muted max-w-sm mx-auto">
                  {registerName} ({registerDid}) can now sign credentials and commit Merkle roots on the decentralized registry.
                </p>
                <button
                  onClick={() => setShowRegisterModal(false)}
                  className="w-full rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white hover:bg-brand-600"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
