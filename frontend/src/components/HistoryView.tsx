import React, { useState } from 'react';
import { Search, Calendar, Filter, Download, History as HistoryIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';

interface HistoryViewProps {
  onReplaySession: (sessionId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onReplaySession }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Filter state
  const [filters, setFilters] = useState({
    event_type: '',
    namespace: '',
    session_id: '',
    start_time: '',
    end_time: '',
    limit: 100,
  });

  // Quick time range buttons
  const setQuickRange = (hours: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
    setFilters(prev => ({
      ...prev,
      start_time: start.toISOString(),
      end_time: now.toISOString(),
    }));
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await api.queryEvents(filters);
      setEvents(results);
    } catch (err: any) {
      setError(err.message || 'Failed to query events');
      console.error('Failed to query events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({
      event_type: '',
      namespace: '',
      session_id: '',
      start_time: '',
      end_time: '',
      limit: 100,
    });
    setEvents([]);
  };

  const toggleEventExpansion = (index: number) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gadget-events-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Get unique session IDs for replay
  const uniqueSessionIds = Array.from(new Set(events.map(e => e.sessionId).filter(Boolean)));

  return (
    <div className="flex-grow p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <HistoryIcon size={32} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Event History</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Query and analyze historical gadget events from the database
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-slate-600 dark:text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Event Type
              </label>
              <select
                value={filters.event_type}
                onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Types</option>
                <option value="trace_sni">Trace SNI</option>
                <option value="trace_tcp">Trace TCP</option>
                <option value="snapshot_process">Snapshot Process</option>
                <option value="snapshot_socket">Snapshot Socket</option>
              </select>
            </div>

            {/* Namespace */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Namespace
              </label>
              <input
                type="text"
                value={filters.namespace}
                onChange={(e) => setFilters({ ...filters, namespace: e.target.value })}
                placeholder="e.g., demo, default"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Session ID */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Session ID
              </label>
              <input
                type="text"
                value={filters.session_id}
                onChange={(e) => setFilters({ ...filters, session_id: e.target.value })}
                placeholder="Full or partial session ID"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={filters.start_time ? filters.start_time.slice(0, 16) : ''}
                onChange={(e) => setFilters({ ...filters, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                End Time
              </label>
              <input
                type="datetime-local"
                value={filters.end_time ? filters.end_time.slice(0, 16) : ''}
                onChange={(e) => setFilters({ ...filters, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Limit */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Limit
              </label>
              <select
                value={filters.limit}
                onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value={50}>50 events</option>
                <option value={100}>100 events</option>
                <option value={500}>500 events</option>
                <option value={1000}>1000 events</option>
              </select>
            </div>
          </div>

          {/* Quick time range buttons */}
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-slate-600 dark:text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Quick ranges:</span>
            <button
              onClick={() => setQuickRange(1)}
              className="px-3 py-1 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm rounded transition-colors"
            >
              Last Hour
            </button>
            <button
              onClick={() => setQuickRange(24)}
              className="px-3 py-1 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm rounded transition-colors"
            >
              Last 24h
            </button>
            <button
              onClick={() => setQuickRange(168)}
              className="px-3 py-1 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm rounded transition-colors"
            >
              Last 7 days
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded font-medium transition-colors"
            >
              <Search size={16} />
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded font-medium transition-colors"
            >
              Reset
            </button>
            {events.length > 0 && (
              <button
                onClick={exportToJSON}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors ml-auto"
              >
                <Download size={16} />
                Export JSON
              </button>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {events.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {/* Results header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  Results: {events.length} events
                </h3>
                {uniqueSessionIds.length > 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    From {uniqueSessionIds.length} session{uniqueSessionIds.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Events list */}
            <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
              {events.map((event, index) => (
                <div key={index} className="p-4 hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-grow">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-mono rounded">
                          {event.eventType || event.event_type}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {formatTimestamp(event.timestamp || event.Timestamp)}
                        </span>
                        {event.sessionId && (
                          <button
                            onClick={() => onReplaySession(event.sessionId)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                          >
                            Replay Session
                          </button>
                        )}
                      </div>

                      {/* Preview of data */}
                      <div className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                        {event.data?.comm && <span className="mr-3">Process: <span className="text-slate-900 dark:text-white">{event.data.comm}</span></span>}
                        {event.data?.pod && <span className="mr-3">Pod: <span className="text-yellow-700 dark:text-yellow-400">{event.data.pod}</span></span>}
                        {event.data?.namespace && <span className="mr-3">Namespace: <span className="text-green-700 dark:text-green-400">{event.data.namespace}</span></span>}
                        {event.data?.sni && <span className="mr-3">SNI: <span className="text-purple-700 dark:text-purple-400">{event.data.sni}</span></span>}
                        {event.data?.name && <span className="mr-3">Name: <span className="text-slate-900 dark:text-white">{event.data.name}</span></span>}
                      </div>

                      {/* Expandable full data */}
                      <button
                        onClick={() => toggleEventExpansion(index)}
                        className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        {expandedEvents.has(index) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandedEvents.has(index) ? 'Hide' : 'Show'} full data
                      </button>

                      {expandedEvents.has(index) && (
                        <pre className="mt-3 p-3 bg-slate-100 dark:bg-slate-900 rounded text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && events.length === 0 && !error && (
          <div className="text-center py-20">
            <HistoryIcon size={64} className="mx-auto text-slate-400 dark:text-slate-600 mb-4" />
            <p className="text-slate-600 dark:text-slate-400 text-lg mb-2">No events found</p>
            <p className="text-slate-500 dark:text-slate-500 text-sm">
              Adjust your filters and click Search to query historical events
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
