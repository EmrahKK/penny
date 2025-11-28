import React, { useMemo, useState } from 'react';
import { Download, Search, ArrowUpDown, Database } from 'lucide-react';
import { GadgetOutput } from '../types';

interface ProcessInfo {
  node: string;
  namespace: string;
  pod: string;
  container: string;
  comm: string;
  pid: number;
  tid: number;
  uid: number;
  gid: number;
}

interface Props {
  outputs: GadgetOutput[];
}

type SortField = 'node' | 'namespace' | 'pod' | 'container' | 'comm' | 'pid' | 'tid' | 'uid' | 'gid';
type SortOrder = 'asc' | 'desc';

export const ProcessSnapshotTable: React.FC<Props> = ({ outputs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('pod');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const processes = useMemo(() => {
    return outputs.map((output) => {
      const data = output.data;
      return {
        node: data.node || data.k8s?.node || 'unknown',
        namespace: data.namespace || data.k8s?.namespace || 'unknown',
        pod: data.pod || data.k8s?.podName || data.k8s?.pod || 'unknown',
        container: data.container || data.k8s?.containerName || data.k8s?.container || 'unknown',
        comm: data.comm || 'unknown',
        pid: data.pid || 0,
        tid: data.tid || 0,
        uid: data.uid || 0,
        gid: data.gid || 0,
      } as ProcessInfo;
    });
  }, [outputs]);

  const filteredAndSortedProcesses = useMemo(() => {
    let filtered = processes;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = processes.filter((proc) => {
        return (
          proc.node.toLowerCase().includes(term) ||
          proc.namespace.toLowerCase().includes(term) ||
          proc.pod.toLowerCase().includes(term) ||
          proc.container.toLowerCase().includes(term) ||
          proc.comm.toLowerCase().includes(term) ||
          proc.pid.toString().includes(term)
        );
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortOrder === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return filtered;
  }, [processes, searchTerm, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Node',
      'Namespace',
      'Pod',
      'Container',
      'Command',
      'PID',
      'TID',
      'UID',
      'GID'
    ];

    const rows = filteredAndSortedProcesses.map((proc) => [
      proc.node,
      proc.namespace,
      proc.pod,
      proc.container,
      proc.comm,
      proc.pid.toString(),
      proc.tid.toString(),
      proc.uid.toString(),
      proc.gid.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `process-snapshot-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (outputs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-500">
        <Database size={48} className="mb-4 opacity-50" />
        <p>No process data available yet...</p>
        <p className="text-sm mt-2">Start the gadget to collect process snapshots</p>
      </div>
    );
  }

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-50" />;
    }
    return (
      <ArrowUpDown
        size={14}
        className={`${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`}
      />
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header with Search and Export */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-4 flex-grow">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Process Snapshot</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {filteredAndSortedProcesses.length} of {processes.length} processes
            </p>
          </div>
          <div className="relative flex-grow max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by pod, container, command, PID..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-400 rounded font-medium transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Process Table */}
      <div className="flex-grow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
            <tr>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('namespace')}
              >
                <div className="flex items-center gap-2">
                  Namespace
                  <SortIcon field="namespace" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('pod')}
              >
                <div className="flex items-center gap-2">
                  Pod
                  <SortIcon field="pod" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('container')}
              >
                <div className="flex items-center gap-2">
                  Container
                  <SortIcon field="container" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('comm')}
              >
                <div className="flex items-center gap-2">
                  Command
                  <SortIcon field="comm" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('pid')}
              >
                <div className="flex items-center gap-2">
                  PID
                  <SortIcon field="pid" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('tid')}
              >
                <div className="flex items-center gap-2">
                  TID
                  <SortIcon field="tid" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('uid')}
              >
                <div className="flex items-center gap-2">
                  UID
                  <SortIcon field="uid" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('gid')}
              >
                <div className="flex items-center gap-2">
                  GID
                  <SortIcon field="gid" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('node')}
              >
                <div className="flex items-center gap-2">
                  Node
                  <SortIcon field="node" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedProcesses.map((proc, index) => (
              <tr
                key={index}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono">
                    {proc.namespace}
                  </span>
                </td>
                <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-xs">{proc.pod}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
                    {proc.container}
                  </span>
                </td>
                <td className="p-3 text-green-700 dark:text-green-400 font-mono text-xs">{proc.comm}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{proc.pid}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{proc.tid}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{proc.uid}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{proc.gid}</td>
                <td className="p-3 text-slate-500 dark:text-slate-500 font-mono text-xs">{proc.node}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedProcesses.length === 0 && searchTerm && (
          <div className="text-center text-slate-500 dark:text-slate-500 py-12">
            <Search size={48} className="mx-auto mb-4 opacity-50" />
            <p>No processes match your search criteria</p>
            <p className="text-sm mt-2">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};
