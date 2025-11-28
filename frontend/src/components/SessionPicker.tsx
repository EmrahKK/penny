import React from 'react';
import { X, Play, Clock } from 'lucide-react';
import { GadgetSession } from '../types';

interface Gadget {
  id: string;
  title: string;
  description: string;
  category: 'trace' | 'top' | 'snapshot' | 'profile' | 'audit';
  icon: any;
  type: 'trace_sni' | 'trace_tcp' | 'snapshot_process' | 'snapshot_socket';
}

interface Props {
  gadget: Gadget;
  sessions: GadgetSession[];
  onSelectSession: (sessionId: string) => void;
  onCreateNew: (gadget: Gadget) => void;
  onClose: () => void;
}

export const SessionPicker: React.FC<Props> = ({
  gadget,
  sessions,
  onSelectSession,
  onCreateNew,
  onClose
}) => {
  const formatTimeAgo = (startTime: string) => {
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m ago`;
    } else if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else {
      return 'Just now';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">
            Select {gadget.title} Session
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Session List */}
        <div className="p-6">
          <p className="text-slate-400 text-sm mb-4">
            Multiple sessions are running for this gadget. Select one to view:
          </p>

          <div className="space-y-2 mb-6">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className="w-full flex items-center justify-between p-4 bg-slate-900 hover:bg-slate-700 border border-slate-700 hover:border-blue-500 rounded transition-colors text-left"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-white font-medium">
                      Namespace: <span className="text-blue-400">{session.namespace || 'All'}</span>
                    </span>
                    {session.podName && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-300 text-sm">
                          Pod: <span className="text-yellow-400">{session.podName}</span>
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Clock size={14} />
                    Started {formatTimeAgo(session.startTime || '')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-green-400 text-sm">Running</span>
                </div>
              </button>
            ))}
          </div>

          {/* Create New Session Button */}
          <button
            onClick={() => onCreateNew(gadget)}
            className="w-full flex items-center justify-center gap-2 p-4 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 hover:border-blue-500 text-blue-400 rounded font-medium transition-colors"
          >
            <Play size={16} />
            Create New Session
          </button>
        </div>
      </div>
    </div>
  );
};
