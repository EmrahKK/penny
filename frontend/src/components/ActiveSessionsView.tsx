import React from 'react';
import { Play, X, Clock, Activity } from 'lucide-react';
import { GadgetSession, GadgetOutput } from '../types';

interface Gadget {
  id: string;
  title: string;
  description: string;
  category: 'trace' | 'top' | 'snapshot' | 'profile' | 'audit';
  icon: any;
  type: 'trace_sni' | 'trace_tcp' | 'snapshot_process' | 'snapshot_socket';
}

interface Props {
  sessions: GadgetSession[];
  sessionOutputs: Map<string, GadgetOutput[]>;
  gadgets: Gadget[];
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
}

export const ActiveSessionsView: React.FC<Props> = ({
  sessions,
  sessionOutputs,
  gadgets,
  onSelectSession,
  onStopSession
}) => {
  const getGadgetInfo = (type: string) => {
    return gadgets.find(g => g.type === type);
  };

  const formatTimeAgo = (startTime: string) => {
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m ago`;
    } else if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else {
      return 'Just now';
    }
  };

  const getEventCount = (sessionId: string): number => {
    return sessionOutputs.get(sessionId)?.length || 0;
  };

  if (sessions.length === 0) {
    return (
      <div className="flex-grow p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Active Sessions (0)</h2>
            <p className="text-slate-600 dark:text-slate-400">
              No active sessions running. Start a gadget to see it here.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <Activity size={64} className="mb-4 opacity-50" />
            <p className="text-lg">No active sessions</p>
            <p className="text-sm mt-2">Select a gadget from the catalog to start monitoring</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Active Sessions ({sessions.length})
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            All running gadget sessions across your cluster. Click "View" to see details.
          </p>
        </div>

        {/* Sessions Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Gadget</th>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Namespace</th>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Pod</th>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Started</th>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Events</th>
                <th className="text-left p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Status</th>
                <th className="text-right p-4 text-slate-700 dark:text-slate-300 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, index) => {
                const gadgetInfo = getGadgetInfo(session.type);
                const eventCount = getEventCount(session.id);

                return (
                  <tr
                    key={session.id}
                    className={`border-b border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
                      index === sessions.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    {/* Gadget */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {gadgetInfo && <gadgetInfo.icon size={20} className="text-blue-600 dark:text-blue-400" />}
                        <span className="text-slate-900 dark:text-white font-medium">{gadgetInfo?.title || session.type}</span>
                      </div>
                    </td>

                    {/* Namespace */}
                    <td className="p-4">
                      <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded font-mono">
                        {session.namespace || 'All'}
                      </span>
                    </td>

                    {/* Pod */}
                    <td className="p-4">
                      {session.podName ? (
                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-mono">
                          {session.podName}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-500 text-sm">All pods</span>
                      )}
                    </td>

                    {/* Started */}
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Clock size={14} />
                        {formatTimeAgo(session.startTime || '')}
                      </div>
                    </td>

                    {/* Events */}
                    <td className="p-4">
                      <div className="text-slate-700 dark:text-slate-300 font-mono text-sm">
                        {eventCount.toLocaleString()}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-green-600 dark:text-green-400 text-sm capitalize">{session.status}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onSelectSession(session.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-400 rounded text-sm font-medium transition-colors"
                        >
                          <Play size={14} />
                          View
                        </button>
                        <button
                          onClick={() => onStopSession(session.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded text-sm font-medium transition-colors"
                        >
                          <X size={14} />
                          Stop
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
