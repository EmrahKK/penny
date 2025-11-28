import React, { useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, BarChart2, Download } from 'lucide-react';
import { api } from '../services/api';

interface SessionReplayProps {
  sessionId: string;
  onClose: () => void;
}

export const SessionReplay: React.FC<SessionReplayProps> = ({ sessionId, onClose }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying || currentIndex >= events.length - 1) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const next = prev + 1;
        if (next >= events.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, events.length, playbackSpeed]);

  const loadSessionData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsData, statsData] = await Promise.all([
        api.getSessionEvents(sessionId),
        api.getSessionStats(sessionId).catch(() => null),
      ]);
      setEvents(eventsData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load session data');
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  const handleSeek = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session-${sessionId}-events.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (start: string, end: string) => {
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const currentEvent = events[currentIndex];
  const progress = events.length > 0 ? ((currentIndex + 1) / events.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] border border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Session Replay</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">{sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex-grow flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">Loading session data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-grow flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={loadSessionData}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Type</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{stats.type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Namespace</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{stats.namespace || 'All'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Duration</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {stats.end_time ? formatDuration(stats.start_time, stats.end_time) : 'Ongoing'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Events</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{events.length.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Playback controls */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={handleReset}
                  className="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-900 dark:text-white"
                  title="Reset to start"
                >
                  <RotateCcw size={20} />
                </button>
                <button
                  onClick={handlePlayPause}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <div className="flex-grow">
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
                    <span>Event {currentIndex + 1} of {events.length}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={events.length - 1}
                    value={currentIndex}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #cbd5e1 ${progress}%, #cbd5e1 100%)`
                    }}
                  />
                </div>

                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded text-sm border border-slate-300 dark:border-slate-600"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={5}>5x</option>
                  <option value={10}>10x</option>
                </select>

                <button
                  onClick={exportToJSON}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>

            {/* Current event display */}
            {currentEvent && (
              <div className="flex-grow p-6 overflow-y-auto">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Current Event</h3>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {formatTimestamp(currentEvent.timestamp || currentEvent.Timestamp)}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-mono rounded">
                      {currentEvent.eventType || currentEvent.event_type}
                    </span>
                  </div>

                  {/* Formatted data display */}
                  {currentEvent.data && (
                    <div className="space-y-2 mb-4">
                      {Object.entries(currentEvent.data).map(([key, value]) => (
                        <div key={key} className="flex items-start">
                          <span className="text-slate-600 dark:text-slate-400 text-sm w-32 flex-shrink-0">{key}:</span>
                          <span className="text-slate-900 dark:text-white text-sm font-mono flex-grow">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Raw JSON */}
                  <details className="mt-4">
                    <summary className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                      Show raw JSON
                    </summary>
                    <pre className="mt-2 p-3 bg-white dark:bg-slate-950 rounded text-xs text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-800">
                      {JSON.stringify(currentEvent.data, null, 2)}
                    </pre>
                  </details>
                </div>

                {/* Event timeline */}
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <BarChart2 size={20} />
                    Event Timeline
                  </h3>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {events.map((event, index) => (
                      <button
                        key={index}
                        onClick={() => handleSeek(index)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          index === currentIndex
                            ? 'bg-blue-600 text-white'
                            : index < currentIndex
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-mono text-xs mr-2">
                          #{index + 1}
                        </span>
                        <span className="text-xs">
                          {formatTimestamp(event.timestamp || event.Timestamp)}
                        </span>
                        {event.data?.comm && (
                          <span className="ml-2 text-xs">- {event.data.comm}</span>
                        )}
                        {event.data?.name && (
                          <span className="ml-2 text-xs">- {event.data.name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {events.length === 0 && (
              <div className="flex-grow flex items-center justify-center p-8">
                <div className="text-center text-slate-600 dark:text-slate-400">
                  <BarChart2 size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No events found for this session</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
