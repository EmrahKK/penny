import React, { useMemo, useState } from 'react';
import { Download, Search, ArrowUpDown, Network } from 'lucide-react';
import { GadgetOutput } from '../types';

interface SocketInfo {
  node: string;
  namespace: string;
  pod: string;
  container: string;
  protocol: string;
  localAddr: string;
  localPort: number;
  remoteAddr: string;
  remotePort: number;
  status: string;
  inode: number;
  uid: number;
}

interface Props {
  outputs: GadgetOutput[];
}

type SortField = 'node' | 'namespace' | 'pod' | 'container' | 'protocol' | 'localAddr' | 'localPort' | 'remoteAddr' | 'remotePort' | 'status' | 'uid';
type SortOrder = 'asc' | 'desc';

export const SocketSnapshotTable: React.FC<Props> = ({ outputs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('pod');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const sockets = useMemo(() => {
    return outputs.map((output) => {
      const data = output.data;
      return {
        node: String(data.node || data.k8s?.node || 'unknown'),
        namespace: String(data.namespace || data.k8s?.namespace || 'unknown'),
        pod: String(data.pod || data.k8s?.podName || data.k8s?.pod || 'unknown'),
        container: String(data.container || data.k8s?.containerName || data.k8s?.container || 'unknown'),
        protocol: String(data.protocol || 'unknown'),
        localAddr: String(data.localAddr || data.local?.addr || data.src?.addr || ''),
        localPort: Number(data.localPort || data.local?.port || data.src?.port || 0),
        remoteAddr: String(data.remoteAddr || data.remote?.addr || data.dst?.addr || ''),
        remotePort: Number(data.remotePort || data.remote?.port || data.dst?.port || 0),
        status: String(data.status || data.state || 'unknown'),
        inode: Number(data.inode || 0),
        uid: Number(data.uid || 0),
      } as SocketInfo;
    });
  }, [outputs]);

  const protocols = useMemo(() => {
    const protocolSet = new Set(sockets.map(s => s.protocol));
    return Array.from(protocolSet).sort();
  }, [sockets]);

  const statuses = useMemo(() => {
    const statusSet = new Set(sockets.map(s => s.status));
    return Array.from(statusSet).sort();
  }, [sockets]);

  const filteredAndSortedSockets = useMemo(() => {
    let filtered = sockets;

    // Apply protocol filter
    if (protocolFilter !== 'all') {
      filtered = filtered.filter(s => s.protocol === protocolFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((socket) => {
        return (
          socket.node.toLowerCase().includes(term) ||
          socket.namespace.toLowerCase().includes(term) ||
          socket.pod.toLowerCase().includes(term) ||
          socket.container.toLowerCase().includes(term) ||
          socket.protocol.toLowerCase().includes(term) ||
          socket.localAddr.toLowerCase().includes(term) ||
          socket.remoteAddr.toLowerCase().includes(term) ||
          socket.status.toLowerCase().includes(term) ||
          socket.localPort.toString().includes(term) ||
          socket.remotePort.toString().includes(term)
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
  }, [sockets, searchTerm, sortField, sortOrder, protocolFilter, statusFilter]);

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
      'Protocol',
      'Local Address',
      'Local Port',
      'Remote Address',
      'Remote Port',
      'Status',
      'Inode',
      'UID'
    ];

    const rows = filteredAndSortedSockets.map((socket) => [
      socket.node,
      socket.namespace,
      socket.pod,
      socket.container,
      socket.protocol,
      socket.localAddr,
      socket.localPort.toString(),
      socket.remoteAddr,
      socket.remotePort.toString(),
      socket.status,
      socket.inode.toString(),
      socket.uid.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `socket-snapshot-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (outputs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-500">
        <Network size={48} className="mb-4 opacity-50" />
        <p>No socket data available yet...</p>
        <p className="text-sm mt-2">Start the gadget to collect socket snapshots</p>
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

  const getStatusColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'LISTEN') return 'text-blue-700 dark:text-blue-400';
    if (s === 'ESTABLISHED' || s === 'CONNECTED') return 'text-green-700 dark:text-green-400';
    if (s === 'TIME_WAIT' || s === 'CLOSE_WAIT') return 'text-yellow-700 dark:text-yellow-400';
    if (s === 'CLOSED') return 'text-red-700 dark:text-red-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header with Search, Filters and Export */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Socket Snapshot</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {filteredAndSortedSockets.length} of {sockets.length} sockets
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

        <div className="flex items-center gap-4">
          <div className="relative flex-grow max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by pod, address, port, status..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Protocols</option>
            {protocols.map(proto => (
              <option key={proto} value={proto}>{proto.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All States</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Socket Table */}
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
                onClick={() => handleSort('protocol')}
              >
                <div className="flex items-center gap-2">
                  Protocol
                  <SortIcon field="protocol" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('localAddr')}
              >
                <div className="flex items-center gap-2">
                  Local Address
                  <SortIcon field="localAddr" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('localPort')}
              >
                <div className="flex items-center gap-2">
                  Local Port
                  <SortIcon field="localPort" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('remoteAddr')}
              >
                <div className="flex items-center gap-2">
                  Remote Address
                  <SortIcon field="remoteAddr" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('remotePort')}
              >
                <div className="flex items-center gap-2">
                  Remote Port
                  <SortIcon field="remotePort" />
                </div>
              </th>
              <th
                className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-2">
                  Status
                  <SortIcon field="status" />
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
            {filteredAndSortedSockets.map((socket, index) => (
              <tr
                key={index}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono">
                    {socket.namespace}
                  </span>
                </td>
                <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-xs">{socket.pod}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
                    {socket.container}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded font-mono ${
                    socket.protocol.toUpperCase() === 'TCP' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                    socket.protocol.toUpperCase() === 'UDP' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    {socket.protocol.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 text-cyan-700 dark:text-cyan-400 font-mono text-xs">
                  {socket.localAddr || '-'}
                </td>
                <td className="p-3 text-cyan-600 dark:text-cyan-300 font-mono text-xs">
                  {socket.localPort || '-'}
                </td>
                <td className="p-3 text-amber-700 dark:text-amber-400 font-mono text-xs">
                  {socket.remoteAddr || '-'}
                </td>
                <td className="p-3 text-amber-600 dark:text-amber-300 font-mono text-xs">
                  {socket.remotePort || '-'}
                </td>
                <td className="p-3">
                  <span className={`text-xs font-semibold ${getStatusColor(socket.status)}`}>
                    {socket.status}
                  </span>
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{socket.uid}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedSockets.length === 0 && (searchTerm || protocolFilter !== 'all' || statusFilter !== 'all') && (
          <div className="text-center text-slate-500 dark:text-slate-500 py-12">
            <Search size={48} className="mx-auto mb-4 opacity-50" />
            <p>No sockets match your filter criteria</p>
            <p className="text-sm mt-2">Try adjusting your filters or search term</p>
          </div>
        )}
      </div>
    </div>
  );
};
