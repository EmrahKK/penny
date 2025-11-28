import React, { useMemo, useState } from 'react';
import { Download, Search, ArrowUpDown, Shield } from 'lucide-react';
import { GadgetOutput } from '../types';

interface SNIInfo {
  node: string;
  namespace: string;
  pod: string;
  container: string;
  comm: string;
  pid: number;
  uid: number;
  gid: number;
  name: string; // SNI server name
  timestamp: string;
}

interface Props {
  outputs: GadgetOutput[];
}

type SortField = 'node' | 'namespace' | 'pod' | 'container' | 'comm' | 'pid' | 'uid' | 'gid' | 'name' | 'timestamp';
type SortOrder = 'asc' | 'desc';

export const TraceSNITable: React.FC<Props> = ({ outputs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const sniEvents = useMemo(() => {
    return outputs.map((output) => {
      const data = output.data;
      return {
        node: String(data.node || data.k8s?.node || 'unknown'),
        namespace: String(data.namespace || data.k8s?.namespace || 'unknown'),
        pod: String(data.pod || data.k8s?.podName || data.k8s?.pod || 'unknown'),
        container: String(data.container || data.k8s?.containerName || data.k8s?.container || 'unknown'),
        comm: String(data.comm || 'unknown'),
        pid: Number(data.pid || 0),
        uid: Number(data.uid || 0),
        gid: Number(data.gid || 0),
        name: String(data.name || ''),
        timestamp: String(output.timestamp || data.timestamp || ''),
      } as SNIInfo;
    });
  }, [outputs]);

  const filteredAndSortedEvents = useMemo(() => {
    let filtered = sniEvents;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((event) => {
        return (
          event.node.toLowerCase().includes(term) ||
          event.namespace.toLowerCase().includes(term) ||
          event.pod.toLowerCase().includes(term) ||
          event.container.toLowerCase().includes(term) ||
          event.comm.toLowerCase().includes(term) ||
          event.name.toLowerCase().includes(term) ||
          event.pid.toString().includes(term) ||
          event.uid.toString().includes(term) ||
          event.gid.toString().includes(term)
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
  }, [sniEvents, searchTerm, sortField, sortOrder]);

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
      'Timestamp',
      'Namespace',
      'Pod',
      'Container',
      'Process',
      'PID',
      'UID',
      'GID',
      'SNI Name',
      'Node'
    ];

    const rows = filteredAndSortedEvents.map((event) => [
      event.timestamp,
      event.namespace,
      event.pod,
      event.container,
      event.comm,
      event.pid.toString(),
      event.uid.toString(),
      event.gid.toString(),
      event.name,
      event.node
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sni-trace-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (outputs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-500">
        <Shield size={48} className="mb-4 opacity-50" />
        <p>No SNI data available yet...</p>
        <p className="text-sm mt-2">Start the gadget to trace TLS SNI requests</p>
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
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">SNI Trace Events</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {filteredAndSortedEvents.length} of {sniEvents.length} events
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-400 rounded font-medium transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by pod, container, process, SNI name..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* SNI Events Table */}
      <div className="flex-grow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
            <tr>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('timestamp')}
              >
                <div className="flex items-center gap-2">
                  Timestamp
                  <SortIcon field="timestamp" />
                </div>
              </th>
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
                  Process
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
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  SNI Name
                  <SortIcon field="name" />
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
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedEvents.map((event, index) => (
              <tr
                key={index}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono">
                    {event.namespace}
                  </span>
                </td>
                <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-xs">{event.pod}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
                    {event.container}
                  </span>
                </td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-400 rounded font-mono">
                    {event.comm}
                  </span>
                </td>
                <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-xs">{event.pid}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded font-mono font-semibold">
                    {event.name || '-'}
                  </span>
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{event.uid}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedEvents.length === 0 && searchTerm && (
          <div className="text-center text-slate-500 dark:text-slate-500 py-12">
            <Search size={48} className="mx-auto mb-4 opacity-50" />
            <p>No SNI events match your search</p>
            <p className="text-sm mt-2">Try adjusting your search term</p>
          </div>
        )}
      </div>
    </div>
  );
};
