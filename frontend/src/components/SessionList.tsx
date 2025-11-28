import React from 'react';
import { GadgetSession } from '../types';

interface Props {
  sessions: GadgetSession[];
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
}

export const SessionList: React.FC<Props> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onStopSession,
}) => {
  const [currentTime, setCurrentTime] = React.useState(Date.now());

  // Update current time every second for elapsed time calculation
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimeout = (nanoseconds?: number): string => {
    if (!nanoseconds) return '';
    const minutes = Math.round(nanoseconds / 1e9 / 60);
    return `${minutes} min`;
  };

  const formatElapsedTime = (startTime?: string): string => {
    if (!startTime) return 'Unknown';

    const start = new Date(startTime).getTime();
    const elapsed = Math.floor((currentTime - start) / 1000); // seconds

    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getTraceMode = (session: GadgetSession): string => {
    if (session.type !== 'trace_tcp') return '';

    if (session.acceptOnly) return 'Accept Only';
    if (session.connectOnly) return 'Connect Only';
    if (session.failureOnly) return 'Failure Only';
    return 'All Events';
  };

  if (sessions.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Active Sessions</h3>
        <p style={styles.empty}>No active sessions</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Active Sessions ({sessions.length})</h3>
      <div style={styles.list}>
        {sessions.map((session) => (
          <div
            key={session.id}
            style={{
              ...styles.item,
              ...(activeSessionId === session.id ? styles.itemActive : {}),
            }}
            onClick={() => onSelectSession(session.id)}
          >
            <div style={styles.itemHeader}>
              <span style={styles.itemType}>{session.type}</span>
              <span
                style={{
                  ...styles.status,
                  ...(session.status === 'running'
                    ? styles.statusRunning
                    : styles.statusStopped),
                }}
              >
                {session.status}
              </span>
            </div>
            <div style={styles.itemDetails}>
              <div>Namespace: {session.namespace || 'all'}</div>
              {session.podName && <div>Pod: {session.podName}</div>}
              <div style={styles.elapsedTime}>
                Running: <span style={styles.elapsedTimeValue}>{formatElapsedTime(session.startTime)}</span>
              </div>
              {session.type === 'trace_tcp' && (
                <div style={styles.traceMode}>
                  Mode: <span style={styles.traceModeValue}>{getTraceMode(session)}</span>
                </div>
              )}
              {session.timeout && (
                <div style={styles.timeout}>
                  Timeout: <span style={styles.timeoutValue}>{formatTimeout(session.timeout)}</span>
                </div>
              )}
            </div>
            <button
              style={styles.stopButton}
              onClick={(e) => {
                e.stopPropagation();
                onStopSession(session.id);
              }}
            >
              Stop
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  title: {
    marginTop: 0,
    marginBottom: '15px',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  empty: {
    color: '#666',
    fontStyle: 'italic',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  item: {
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'all 0.2s',
  },
  itemActive: {
    borderColor: '#007bff',
    boxShadow: '0 2px 4px rgba(0,123,255,0.2)',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  itemType: {
    fontWeight: 'bold',
    fontSize: '14px',
  },
  status: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  statusRunning: {
    backgroundColor: '#28a745',
    color: 'white',
  },
  statusStopped: {
    backgroundColor: '#6c757d',
    color: 'white',
  },
  itemDetails: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '10px',
  },
  elapsedTime: {
    marginTop: '5px',
  },
  elapsedTimeValue: {
    fontWeight: '600',
    color: '#4CAF50',
  },
  traceMode: {
    marginTop: '5px',
  },
  traceModeValue: {
    fontWeight: '600',
    color: '#007bff',
  },
  timeout: {
    marginTop: '5px',
  },
  timeoutValue: {
    fontWeight: '600',
    color: '#FF9800',
  },
  stopButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    padding: '5px 12px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
