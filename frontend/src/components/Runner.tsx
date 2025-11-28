import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  Pause,
  X,
  Server,
  Box,
  Filter,
  Download,
  Clock,
  Timer
} from 'lucide-react';
import { GadgetSession, GadgetOutput } from '../types';
import { TCPFlowDiagram } from './TCPFlowDiagram';
import { TCPSummaryTable } from './TCPSummaryTable';
import { ProcessSnapshotTable } from './ProcessSnapshotTable';
import { SocketSnapshotTable } from './SocketSnapshotTable';
import { TraceSNITable } from './TraceSNITable';

interface Gadget {
  id: string;
  title: string;
  description: string;
  category: string;
  type: 'trace_sni' | 'trace_tcp' | 'snapshot_process' | 'snapshot_socket';
}

interface RunnerProps {
  gadget: Gadget;
  session: GadgetSession | null;
  onClose: () => void;
  onStart: (config: any) => void;
  onStop: () => void;
  outputs: GadgetOutput[];
}

export const Runner: React.FC<RunnerProps> = ({
  gadget,
  session,
  onClose,
  onStart,
  onStop,
  outputs
}) => {
  // Determine default tab based on gadget type
  const defaultTab = gadget.type === 'trace_tcp' ? 'visual' :
                     (gadget.type === 'snapshot_process' || gadget.type === 'snapshot_socket' || gadget.type === 'trace_sni') ? 'table' : 'raw';
  const [activeTab, setActiveTab] = useState<'visual' | 'summary' | 'table' | 'raw'>(defaultTab as any);
  const [namespace, setNamespace] = useState('default');
  const [podName, setPodName] = useState('');
  const [tcpFilter, setTcpFilter] = useState<'all' | 'accept' | 'connect' | 'failure'>('all');
  const [elapsedTime, setElapsedTime] = useState<string>('0s');
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [timeoutProgress, setTimeoutProgress] = useState<number>(0);

  const isRunning = session?.status === 'running';

  // Update elapsed time and remaining time every second
  useEffect(() => {
    if (!session?.startTime || !isRunning) {
      setElapsedTime('0s');
      setRemainingTime('');
      setTimeoutProgress(0);
      return;
    }

    const updateTime = () => {
      const start = new Date(session.startTime!).getTime();
      const now = new Date().getTime();
      const elapsedMs = now - start;

      // Calculate elapsed time
      const seconds = Math.floor(elapsedMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setElapsedTime(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setElapsedTime(`${minutes}m ${seconds % 60}s`);
      } else {
        setElapsedTime(`${seconds}s`);
      }

      // Calculate remaining time (timeout is in nanoseconds, default 30 min)
      const timeoutMs = session.timeout ? session.timeout / 1000000 : 30 * 60 * 1000;
      const remainingMs = Math.max(0, timeoutMs - elapsedMs);
      const remainingSeconds = Math.floor(remainingMs / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const remainingHours = Math.floor(remainingMinutes / 60);

      if (remainingHours > 0) {
        setRemainingTime(`${remainingHours}h ${remainingMinutes % 60}m`);
      } else if (remainingMinutes > 0) {
        setRemainingTime(`${remainingMinutes}m ${remainingSeconds % 60}s`);
      } else if (remainingSeconds > 0) {
        setRemainingTime(`${remainingSeconds}s`);
      } else {
        setRemainingTime('0s');
      }

      // Calculate progress percentage
      const progress = Math.min(100, (elapsedMs / timeoutMs) * 100);
      setTimeoutProgress(progress);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [session?.startTime, session?.timeout, isRunning]);

  const handleStart = () => {
    const config: any = {
      type: gadget.type,
      namespace: namespace || undefined,
      podName: podName || undefined,
    };

    // Add TCP-specific filter if it's a trace_tcp gadget and not "all"
    if (gadget.type === 'trace_tcp' && tcpFilter !== 'all') {
      if (tcpFilter === 'accept') config.acceptOnly = true;
      if (tcpFilter === 'connect') config.connectOnly = true;
      if (tcpFilter === 'failure') config.failureOnly = true;
    }

    onStart(config);
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(outputs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${gadget.id}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Runner Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Terminal size={20} className="text-blue-600 dark:text-blue-400" />
            {gadget.title}
            {isRunning && (
              <>
                <span className="flex h-3 w-3 relative ml-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="flex items-center gap-1.5 text-sm font-normal text-slate-600 dark:text-slate-400 ml-2">
                  <Clock size={14} />
                  {elapsedTime}
                </span>
                <span className="text-slate-300 dark:text-slate-600 mx-2">•</span>
                <span className={`flex items-center gap-1.5 text-sm font-normal ${
                  timeoutProgress > 90 ? 'text-red-500 dark:text-red-400' :
                  timeoutProgress > 75 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-slate-600 dark:text-slate-400'
                }`}>
                  <Timer size={14} />
                  {remainingTime} left
                </span>
              </>
            )}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
            Targeting: <span className="text-yellow-600 dark:text-yellow-400">{namespace || 'All Namespaces'}</span>
            {podName && <> • Pod: <span className="text-yellow-600 dark:text-yellow-400">{podName}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={isRunning ? onStop : handleStart}
            className={`flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors ${
              isRunning
                ? 'bg-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isRunning ? (
              <>
                <Pause size={16} /> Stop
              </>
            ) : (
              <>
                <Play size={16} /> Start Gadget
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400"
            title="Close View"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Runner Configuration */}
      {!isRunning && (
        <div className="bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-slate-700 dark:text-slate-300 text-sm font-semibold mb-3">Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Namespace</label>
              <input
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="default"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Pod Name (optional)</label>
              <input
                type="text"
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder="Leave empty for all pods"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* TCP-specific options */}
          {gadget.type === 'trace_tcp' && (
            <div className="mt-4">
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2">TCP Filter</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="tcpFilter"
                    value="all"
                    checked={tcpFilter === 'all'}
                    onChange={(e) => setTcpFilter(e.target.value as 'all' | 'accept' | 'connect' | 'failure')}
                    className="rounded-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                  All
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="tcpFilter"
                    value="accept"
                    checked={tcpFilter === 'accept'}
                    onChange={(e) => setTcpFilter(e.target.value as 'all' | 'accept' | 'connect' | 'failure')}
                    className="rounded-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                  Accept Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="tcpFilter"
                    value="connect"
                    checked={tcpFilter === 'connect'}
                    onChange={(e) => setTcpFilter(e.target.value as 'all' | 'accept' | 'connect' | 'failure')}
                    className="rounded-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                  Connect Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="tcpFilter"
                    value="failure"
                    checked={tcpFilter === 'failure'}
                    onChange={(e) => setTcpFilter(e.target.value as 'all' | 'accept' | 'connect' | 'failure')}
                    className="rounded-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                  Failure Only
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Configuration Display */}
      {isRunning && session && (
        <div className="bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 p-3 flex gap-4 text-sm text-slate-600 dark:text-slate-400 overflow-x-auto">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1 rounded border border-slate-300 dark:border-slate-700">
            <Server size={14} /> Namespace: <span className="text-slate-900 dark:text-slate-200">{session.namespace || 'All'}</span>
          </div>
          {session.podName && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1 rounded border border-slate-300 dark:border-slate-700">
              <Box size={14} /> Pod: <span className="text-slate-900 dark:text-slate-200">{session.podName}</span>
            </div>
          )}
          {(session.acceptOnly || session.connectOnly || session.failureOnly) && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1 rounded border border-slate-300 dark:border-slate-700">
              <Filter size={14} /> Filters:
              <span className="text-slate-900 dark:text-slate-200">
                {[
                  session.acceptOnly && 'Accept',
                  session.connectOnly && 'Connect',
                  session.failureOnly && 'Failure'
                ].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Output Area */}
      <div className="flex-grow flex flex-col overflow-hidden">
        {/* Show tabs for trace_tcp */}
        {gadget.type === 'trace_tcp' && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'visual'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Flow Diagram
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'summary'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Summary Table
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'raw'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Raw JSON
            </button>
            <div className="ml-auto flex items-center px-4">
              <button
                onClick={handleExportJSON}
                disabled={outputs.length === 0}
                className="flex items-center gap-2 text-xs px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-blue-600 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>
        )}

        {/* Show tabs for snapshot_process, snapshot_socket, and trace_sni */}
        {(gadget.type === 'snapshot_process' || gadget.type === 'snapshot_socket' || gadget.type === 'trace_sni') && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              onClick={() => setActiveTab('table')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'table'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'raw'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Raw JSON
            </button>
            <div className="ml-auto flex items-center px-4">
              <button
                onClick={handleExportJSON}
                disabled={outputs.length === 0}
                className="flex items-center gap-2 text-xs px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-blue-600 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-hidden bg-white dark:bg-slate-900">
          {gadget.type === 'trace_tcp' && activeTab === 'visual' ? (
            <div className="h-full w-full">
              {!isRunning && outputs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 opacity-50">
                  <Play size={48} className="mb-4" />
                  <p>Configure and start the gadget to collect data...</p>
                </div>
              ) : (
                <TCPFlowDiagram outputs={outputs} />
              )}
            </div>
          ) : gadget.type === 'trace_tcp' && activeTab === 'summary' ? (
            <div className="h-full w-full">
              <TCPSummaryTable outputs={outputs} />
            </div>
          ) : gadget.type === 'snapshot_process' && activeTab === 'table' ? (
            <div className="h-full w-full">
              <ProcessSnapshotTable outputs={outputs} />
            </div>
          ) : gadget.type === 'snapshot_socket' && activeTab === 'table' ? (
            <div className="h-full w-full">
              <SocketSnapshotTable outputs={outputs} />
            </div>
          ) : gadget.type === 'trace_sni' && activeTab === 'table' ? (
            <div className="h-full w-full">
              <TraceSNITable outputs={outputs} />
            </div>
          ) : (
            <div className="h-full overflow-auto p-6">
              {!isRunning && outputs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 opacity-50">
                  <Play size={48} className="mb-4" />
                  <p>Configure and start the gadget to collect data...</p>
                </div>
              ) : (
                <div className="font-mono text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap">
                  {JSON.stringify(outputs.slice(-20), null, 2)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
