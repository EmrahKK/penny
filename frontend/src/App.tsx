import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart2,
  Camera,
  Cpu,
  Shield,
  Box,
  X,
  Zap,
  Network,
  Lock,
  History
} from 'lucide-react';
import { GadgetCard } from './components/GadgetCard';
import { Runner } from './components/Runner';
import { ActiveSessionsView } from './components/ActiveSessionsView';
import { SessionPicker } from './components/SessionPicker';
import { HistoryView } from './components/HistoryView';
import { SessionReplay } from './components/SessionReplay';
import { ThemeToggle } from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { GadgetRequest, GadgetSession, GadgetOutput as GadgetOutputType } from './types';
import { api } from './services/api';

interface Gadget {
  id: string;
  title: string;
  description: string;
  category: 'trace' | 'top' | 'snapshot' | 'profile' | 'audit';
  icon: any;
  type: 'trace_sni' | 'trace_tcp' | 'snapshot_process' | 'snapshot_socket';
}

function App() {
  const [sessions, setSessions] = useState<GadgetSession[]>([]);
  const [activeGadget, setActiveGadget] = useState<Gadget | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sessionOutputs, setSessionOutputs] = useState<Map<string, GadgetOutputType[]>>(new Map());
  const [websockets, setWebsockets] = useState<Map<string, WebSocket>>(new Map());
  const [connectingWebSockets, setConnectingWebSockets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [sessionPickerGadget, setSessionPickerGadget] = useState<Gadget | null>(null);
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);

  // Define available gadgets
  const gadgets: Gadget[] = [
    {
      id: 'trace-sni',
      title: 'Trace SNI',
      description: 'Trace Server Name Indication (SNI) from TLS requests.',
      category: 'trace',
      icon: Lock,
      type: 'trace_sni'
    },
    {
      id: 'trace-tcp',
      title: 'Trace TCP',
      description: 'Monitor TCP connections, accepts, and failures in real-time.',
      category: 'trace',
      icon: Activity,
      type: 'trace_tcp'
    },
    {
      id: 'snapshot-process',
      title: 'Snapshot Process',
      description: 'Get a one-time list of all running processes.',
      category: 'snapshot',
      icon: Camera,
      type: 'snapshot_process'
    },
    {
      id: 'snapshot-socket',
      title: 'Snapshot Socket',
      description: 'Get a one-time list of all open network sockets.',
      category: 'snapshot',
      icon: Network,
      type: 'snapshot_socket'
    }
  ];

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect WebSockets for all running sessions
  useEffect(() => {
    // Find sessions that need WebSocket connections
    sessions.forEach(session => {
      if (session.status === 'running' &&
          !websockets.has(session.id) &&
          !connectingWebSockets.has(session.id)) {
        connectWebSocket(session.id);
      }
    });

    // Clean up WebSockets for sessions that no longer exist
    websockets.forEach((ws, sessionId) => {
      if (!sessions.find(s => s.id === sessionId)) {
        ws.close();
        setWebsockets(prev => {
          const newMap = new Map(prev);
          newMap.delete(sessionId);
          return newMap;
        });
        setConnectingWebSockets(prev => {
          const newSet = new Set(prev);
          newSet.delete(sessionId);
          return newSet;
        });
      }
    });
  }, [sessions]);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const connectWebSocket = (sessionId: string) => {
    // Mark as connecting
    setConnectingWebSockets(prev => {
      const newSet = new Set(prev);
      newSet.add(sessionId);
      return newSet;
    });

    const wsUrl = api.getWebSocketUrl(sessionId);
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected for session:', sessionId);
      setError(null);

      // Remove from connecting set and add to websockets map
      setConnectingWebSockets(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });

      setWebsockets(prev => {
        const newMap = new Map(prev);
        newMap.set(sessionId, websocket);
        return newMap;
      });
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'error') {
          setError(message.message);
          return;
        }

        if (message.type === 'session_ended') {
          console.log('Session ended:', message.status);
          loadSessions();
          return;
        }

        // Regular gadget output - append to the specific session's outputs
        if (message.data) {
          setSessionOutputs((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(sessionId) || [];
            newMap.set(sessionId, [...existing, message]);
            return newMap;
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error for session', sessionId, ':', error);
      setError('WebSocket connection error');

      // Remove from connecting set on error
      setConnectingWebSockets(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected for session:', sessionId);

      // Remove from both maps
      setWebsockets(prev => {
        const newMap = new Map(prev);
        newMap.delete(sessionId);
        return newMap;
      });

      setConnectingWebSockets(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });
    };
  };

  const handleStartGadget = async (request: GadgetRequest) => {
    try {
      setError(null);
      const session = await api.startSession(request);
      setSessions((prev) => [...prev, session]);
      setActiveSessionId(session.id);
    } catch (error: any) {
      setError(error.response?.data || 'Failed to start gadget');
      console.error('Failed to start gadget:', error);
    }
  };

  const handleStopSession = async (sessionId?: string) => {
    const idToStop = sessionId || activeSessionId;
    if (!idToStop) return;

    try {
      await api.stopSession(idToStop);

      // Close WebSocket for this session
      const ws = websockets.get(idToStop);
      if (ws) {
        ws.close();
        setWebsockets(prev => {
          const newMap = new Map(prev);
          newMap.delete(idToStop);
          return newMap;
        });
      }

      // Remove session, outputs
      setSessions((prev) => prev.filter((s) => s.id !== idToStop));
      setSessionOutputs((prev) => {
        const newMap = new Map(prev);
        newMap.delete(idToStop);
        return newMap;
      });

      if (activeSessionId === idToStop) {
        setActiveSessionId(undefined);
        setActiveGadget(null);
      }
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const handleSelectGadget = (gadget: Gadget) => {
    // Find all running sessions for this gadget type
    const runningSessions = sessions.filter(s => s.type === gadget.type && s.status === 'running');

    if (runningSessions.length > 1) {
      // Multiple sessions exist - show picker
      setSessionPickerGadget(gadget);
      setShowSessionPicker(true);
    } else if (runningSessions.length === 1) {
      // Single session exists - open it directly
      setActiveGadget(gadget);
      setActiveSessionId(runningSessions[0].id);
    } else {
      // No sessions - open configuration
      setActiveGadget(gadget);
      setActiveSessionId(undefined);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      const gadget = gadgets.find(g => g.type === session.type);
      if (gadget) {
        setActiveGadget(gadget);
        setActiveSessionId(sessionId);
        setShowSessionPicker(false);
        setSessionPickerGadget(null);
      }
    }
  };

  const handleCreateNewSession = (gadget: Gadget) => {
    setActiveGadget(gadget);
    setActiveSessionId(undefined);
    setShowSessionPicker(false);
    setSessionPickerGadget(null);
  };

  const handleCloseRunner = () => {
    setActiveGadget(null);
  };

  const getActiveSession = (): GadgetSession | null => {
    if (!activeSessionId) return null;
    return sessions.find(s => s.id === activeSessionId) || null;
  };

  const filteredGadgets = selectedCategory === 'all'
    ? gadgets
    : gadgets.filter(g => g.category === selectedCategory);

  const runningCount = sessions.filter(s => s.status === 'running').length;

  return (
    <ThemeProvider>
      <div className="flex h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans selection:bg-blue-500/30 transition-colors">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900 flex-shrink-0">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <img src="/logo.svg" alt="PENNY Logo" className="w-8 h-8" />
              PENNY
            </h1>
            <ThemeToggle />
          </div>

        <div className="flex-grow overflow-y-auto">
          <div className="p-4 space-y-1">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase px-2 mb-2">Catalog</div>
            {[
              { id: 'all', label: 'All Gadgets', icon: Box },
              { id: 'trace', label: 'Trace (Stream)', icon: Activity },
              { id: 'top', label: 'Top (Metrics)', icon: BarChart2 },
              { id: 'snapshot', label: 'Snapshot', icon: Camera },
              { id: 'profile', label: 'Profile', icon: Cpu },
              { id: 'audit', label: 'Security Audit', icon: Shield },
              { id: 'sessions', label: `Active Sessions (${runningCount})`, icon: Zap },
              { id: 'history', label: 'History', icon: History }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setActiveGadget(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <cat.icon size={16} />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-500">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            PENNY
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            v0.4.0
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950">
        {error && (
          <div className="bg-red-500/20 border-b border-red-500/50 text-red-600 dark:text-red-400 px-6 py-3 flex items-center justify-between">
            <span>
              <strong>Error:</strong> {error}
            </span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {activeGadget ? (
          <Runner
            gadget={activeGadget}
            session={getActiveSession()}
            onClose={handleCloseRunner}
            onStart={handleStartGadget}
            onStop={() => handleStopSession()}
            outputs={activeSessionId ? (sessionOutputs.get(activeSessionId) || []) : []}
          />
        ) : selectedCategory === 'sessions' ? (
          <ActiveSessionsView
            sessions={sessions.filter(s => s.status === 'running')}
            sessionOutputs={sessionOutputs}
            gadgets={gadgets}
            onSelectSession={handleSelectSession}
            onStopSession={handleStopSession}
          />
        ) : selectedCategory === 'history' ? (
          <HistoryView
            onReplaySession={(sessionId) => setReplaySessionId(sessionId)}
          />
        ) : (
          <div className="flex-grow p-8 overflow-y-auto bg-white dark:bg-slate-950">
            <div className="max-w-6xl mx-auto">
              <div className="mb-8 flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Gadget Catalog</h2>
                  <p className="text-slate-600 dark:text-slate-400">
                    Select an eBPF tool to inspect your cluster capabilities.
                  </p>
                </div>
                {runningCount > 0 && (
                  <div className="text-sm bg-slate-100 dark:bg-slate-800 border border-green-500/30 text-green-600 dark:text-green-400 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
                    <Zap size={14} fill="currentColor" />
                    {runningCount} gadget{runningCount > 1 ? 's' : ''} active in background
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredGadgets.map(gadget => {
                  const isRunning = sessions.some(
                    s => s.type === gadget.type && s.status === 'running'
                  );
                  return (
                    <GadgetCard
                      key={gadget.id}
                      title={gadget.title}
                      description={gadget.description}
                      icon={gadget.icon}
                      category={gadget.category}
                      isRunning={isRunning}
                      onRun={() => handleSelectGadget(gadget)}
                    />
                  );
                })}
              </div>

              {filteredGadgets.length === 0 && (
                <div className="text-center text-slate-500 dark:text-slate-500 py-12">
                  <p>No gadgets available in this category yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Session Picker Modal */}
        {showSessionPicker && sessionPickerGadget && (
          <SessionPicker
            gadget={sessionPickerGadget}
            sessions={sessions.filter(s => s.type === sessionPickerGadget.type && s.status === 'running')}
            onSelectSession={handleSelectSession}
            onCreateNew={handleCreateNewSession}
            onClose={() => {
              setShowSessionPicker(false);
              setSessionPickerGadget(null);
            }}
          />
        )}

        {/* Session Replay Modal */}
        {replaySessionId && (
          <SessionReplay
            sessionId={replaySessionId}
            onClose={() => setReplaySessionId(null)}
          />
        )}
      </div>
    </div>
    </ThemeProvider>
  );
}

export default App;
