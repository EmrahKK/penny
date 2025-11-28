import React, { useMemo } from 'react';
import { Download, ArrowRight, AlertCircle, Activity } from 'lucide-react';
import { GadgetOutput } from '../types';

interface ConnectionSummary {
  source: string;
  namespace: string;
  container: string;
  destinations: Map<string, DestinationStats>;
  totalConnections: number;
  totalErrors: number;
  acceptCount: number;
  connectCount: number;
}

interface DestinationStats {
  destination: string;
  connections: number;
  errors: number;
  type: 'accept' | 'connect';
}

interface Props {
  outputs: GadgetOutput[];
}

export const TCPSummaryTable: React.FC<Props> = ({ outputs }) => {
  const summary = useMemo(() => {
    const summaryMap = new Map<string, ConnectionSummary>();

    outputs.forEach((output) => {
      const data = output.data;
      const eventType = data.type as string;
      const hasError = data.error && data.error !== 0;

      // Extract source info
      const sourcePod = data.k8s?.podName || data.k8s?.pod || data.pod || 'unknown';
      const sourceNamespace = data.k8s?.namespace || data.namespace || 'unknown';
      const sourceContainer = data.k8s?.containerName || data.k8s?.container || data.container || 'unknown';
      const sourceKey = `${sourceNamespace}/${sourcePod}/${sourceContainer}`;

      // Extract destination info
      let destination = '';
      if (typeof data.dst === 'object' && data.dst.k8s) {
        const dstK8s = data.dst.k8s;
        const dstPort = data.dst.port || 0;

        if (dstK8s.kind === 'svc' && dstK8s.name) {
          destination = `${dstK8s.name}.${dstK8s.namespace}.svc:${dstPort}`;
        } else if (dstK8s.kind === 'pod' && dstK8s.name) {
          destination = `${dstK8s.name}.${dstK8s.namespace}.pod:${dstPort}`;
        } else if (dstK8s.kind !== 'raw' && dstK8s.name) {
          destination = `${dstK8s.name}.${dstK8s.namespace}:${dstPort}`;
        }
      }

      // Fallback to IP:port if no Kubernetes info
      if (!destination) {
        const dstIp = typeof data.dst === 'object' ? (data.dst.addr || 'unknown') : (data.dst || 'unknown');
        const dstPort = typeof data.dst === 'object' ? String(data.dst.port || 0) : '0';
        destination = `${dstIp}:${dstPort}`;
      }

      // Get or create summary entry for this source
      let sourceSummary = summaryMap.get(sourceKey);
      if (!sourceSummary) {
        sourceSummary = {
          source: sourcePod,
          namespace: sourceNamespace,
          container: sourceContainer,
          destinations: new Map(),
          totalConnections: 0,
          totalErrors: 0,
          acceptCount: 0,
          connectCount: 0,
        };
        summaryMap.set(sourceKey, sourceSummary);
      }

      // Update destination stats
      let destStats = sourceSummary.destinations.get(destination);
      if (!destStats) {
        destStats = {
          destination,
          connections: 0,
          errors: 0,
          type: eventType as 'accept' | 'connect',
        };
        sourceSummary.destinations.set(destination, destStats);
      }

      // Update counts
      destStats.connections++;
      if (hasError) {
        destStats.errors++;
        sourceSummary.totalErrors++;
      }
      sourceSummary.totalConnections++;

      if (eventType === 'accept') {
        sourceSummary.acceptCount++;
      } else if (eventType === 'connect') {
        sourceSummary.connectCount++;
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) =>
      b.totalConnections - a.totalConnections
    );
  }, [outputs]);

  const handleExportCSV = () => {
    const headers = [
      'Source Pod',
      'Container',
      'Namespace',
      'Destination',
      'Total Connections',
      'Errors',
      'Accept Count',
      'Connect Count',
      'Error Rate %'
    ];

    const rows: string[][] = [];

    summary.forEach((source) => {
      const destinations = Array.from(source.destinations.values());

      if (destinations.length === 0) {
        // Add row even if no destinations
        rows.push([
          source.source,
          source.container,
          source.namespace,
          '-',
          source.totalConnections.toString(),
          source.totalErrors.toString(),
          source.acceptCount.toString(),
          source.connectCount.toString(),
          source.totalConnections > 0
            ? ((source.totalErrors / source.totalConnections) * 100).toFixed(2)
            : '0.00'
        ]);
      } else {
        // Add a row for each destination
        destinations.forEach((dest, index) => {
          rows.push([
            index === 0 ? source.source : '', // Only show source on first row
            index === 0 ? source.container : '',
            index === 0 ? source.namespace : '',
            dest.destination,
            index === 0 ? source.totalConnections.toString() : '',
            index === 0 ? source.totalErrors.toString() : '',
            index === 0 ? source.acceptCount.toString() : '',
            index === 0 ? source.connectCount.toString() : '',
            index === 0 && source.totalConnections > 0
              ? ((source.totalErrors / source.totalConnections) * 100).toFixed(2)
              : ''
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tcp-summary-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (outputs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-500">
        <Activity size={48} className="mb-4 opacity-50" />
        <p>No connection data available yet...</p>
        <p className="text-sm mt-2">Start the gadget to collect TCP connection statistics</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header with Export Button */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Connection Summary</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Aggregated statistics from {outputs.length} TCP events
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

      {/* Summary Table */}
      <div className="flex-grow overflow-auto p-4">
        <div className="space-y-4">
          {summary.map((source, index) => {
            const errorRate = source.totalConnections > 0
              ? ((source.totalErrors / source.totalConnections) * 100).toFixed(1)
              : '0.0';
            const destinations = Array.from(source.destinations.values());

            return (
              <div
                key={index}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Source Header */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-slate-900 dark:text-white font-semibold text-base">{source.source}</h4>
                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
                          {source.container}
                        </span>
                        <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 rounded font-mono">
                          {source.namespace}
                        </span>
                      </div>
                      <div className="flex gap-6 mt-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                          <span className="text-blue-700 dark:text-blue-400 font-semibold">
                            {source.totalConnections}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400">Accepts:</span>
                          <span className="text-green-700 dark:text-green-400 font-semibold">
                            {source.acceptCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-400">Connects:</span>
                          <span className="text-purple-700 dark:text-purple-400 font-semibold">
                            {source.connectCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertCircle size={14} className="text-red-600 dark:text-red-400" />
                          <span className="text-slate-600 dark:text-slate-400">Errors:</span>
                          <span className={`font-semibold ${
                            source.totalErrors > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'
                          }`}>
                            {source.totalErrors}
                            {source.totalErrors > 0 && (
                              <span className="text-xs ml-1">({errorRate}%)</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Destinations List */}
                {destinations.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {destinations.slice(0, 10).map((dest, destIndex) => (
                      <div
                        key={destIndex}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-grow">
                            <ArrowRight size={14} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
                            <span className="font-mono text-sm text-slate-700 dark:text-slate-300 break-all">
                              {dest.destination}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              dest.type === 'accept'
                                ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                                : 'bg-purple-500/20 text-purple-700 dark:text-purple-400'
                            }`}>
                              {dest.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                            <div className="text-sm">
                              <span className="text-slate-600 dark:text-slate-400">Connections: </span>
                              <span className="text-blue-700 dark:text-blue-400 font-semibold">
                                {dest.connections}
                              </span>
                            </div>
                            {dest.errors > 0 && (
                              <div className="text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Errors: </span>
                                <span className="text-red-600 dark:text-red-400 font-semibold">
                                  {dest.errors}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {destinations.length > 10 && (
                      <div className="p-3 text-center text-sm text-slate-500 dark:text-slate-500">
                        ... and {destinations.length - 10} more destinations
                      </div>
                    )}
                  </div>
                )}

                {destinations.length === 0 && (
                  <div className="p-4 text-center text-slate-500 dark:text-slate-500 text-sm">
                    No destination data available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
