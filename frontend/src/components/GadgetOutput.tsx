import React, { useEffect, useRef, useMemo } from 'react';
import { GadgetOutput as GadgetOutputType } from '../types';
import { TCPFlowDiagram } from './TCPFlowDiagram';
import { ConnectionLifecycle } from './ConnectionLifecycle';
import { ConnectionTracker } from '../utils/connectionTracker';

interface Props {
  outputs: GadgetOutputType[];
  sessionId?: string;
}

export const GadgetOutput: React.FC<Props> = ({ outputs, sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<'logs' | 'flow' | 'connections'>('logs');

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [outputs, autoScroll]);

  // Process outputs through connection tracker
  const { connections, statistics } = useMemo(() => {
    const tracker = new ConnectionTracker();
    outputs.forEach((output) => {
      tracker.processEvent(output);
    });
    return {
      connections: tracker.getAllConnections(),
      statistics: tracker.getStatistics(),
    };
  }, [outputs]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const downloadJSON = () => {
    const dataStr = JSON.stringify(outputs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tcp-trace-${sessionId}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    // Flatten nested objects for CSV
    const flattenObject = (obj: any, prefix = ''): any => {
      return Object.keys(obj).reduce((acc: any, key: string) => {
        const prefixedKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(acc, flattenObject(obj[key], prefixedKey));
        } else {
          acc[prefixedKey] = obj[key];
        }
        return acc;
      }, {});
    };

    const flatData = outputs.map(output => ({
      sessionId: output.sessionId,
      timestamp: output.timestamp,
      eventType: output.eventType,
      ...flattenObject(output.data)
    }));

    if (flatData.length === 0) return;

    // Get all unique keys
    const keys = Array.from(new Set(flatData.flatMap(obj => Object.keys(obj))));

    // Create CSV header
    const csvHeader = keys.join(',');

    // Create CSV rows
    const csvRows = flatData.map(obj =>
      keys.map(key => {
        const value = obj[key];
        if (value === null || value === undefined) return '';
        // Escape values that contain commas or quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    );

    const csv = [csvHeader, ...csvRows].join('\n');
    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tcp-trace-${sessionId}-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderEventData = (data: Record<string, any>) => {
    // Common fields to highlight
    const highlightFields = ['comm', 'pid', 'args', 'srcIp', 'dstIp', 'srcPort', 'dstPort'];

    return (
      <div style={styles.eventData}>
        {Object.entries(data).map(([key, value]) => {
          if (value === null || value === undefined || value === '') return null;

          const isHighlight = highlightFields.includes(key);

          return (
            <div key={key} style={styles.field}>
              <span style={styles.fieldKey}>{key}:</span>{' '}
              <span style={isHighlight ? styles.fieldValueHighlight : styles.fieldValue}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!sessionId) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Gadget Output</h3>
        <p style={styles.empty}>Select a session to view output</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Gadget Output</h3>
        <div style={styles.controls}>
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'logs' ? styles.toggleButtonActive : {}),
              }}
              onClick={() => setViewMode('logs')}
            >
              Raw Logs
            </button>
            <button
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'flow' ? styles.toggleButtonActive : {}),
              }}
              onClick={() => setViewMode('flow')}
            >
              Flow Diagram
            </button>
            <button
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'connections' ? styles.toggleButtonActive : {}),
              }}
              onClick={() => setViewMode('connections')}
            >
              Connections
            </button>
          </div>
          {viewMode === 'logs' && (
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          )}
          <span style={styles.count}>{outputs.length} events</span>
          {outputs.length > 0 && (
            <div style={styles.downloadButtons}>
              <button onClick={downloadJSON} style={styles.downloadButton} title="Download as JSON">
                📥 JSON
              </button>
              <button onClick={downloadCSV} style={styles.downloadButton} title="Download as CSV">
                📥 CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'flow' ? (
        <TCPFlowDiagram outputs={outputs} />
      ) : viewMode === 'connections' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ConnectionLifecycle connections={connections} statistics={statistics} />
        </div>
      ) : (
        <div
          ref={containerRef}
          style={styles.outputContainer}
          onScroll={handleScroll}
        >
          {outputs.length === 0 ? (
            <p style={styles.empty}>Waiting for events...</p>
          ) : (
            outputs.map((output, index) => (
              <div key={index} style={styles.event}>
                <div style={styles.eventHeader}>
                  <span style={styles.timestamp}>
                    {formatTimestamp(output.timestamp)}
                  </span>
                  <span style={styles.eventType}>{output.eventType}</span>
                </div>
                {renderEventData(output.data)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    height: '600px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  viewToggle: {
    display: 'flex',
    gap: '5px',
    backgroundColor: '#e0e0e0',
    borderRadius: '6px',
    padding: '3px',
  },
  toggleButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    transition: 'all 0.2s',
  },
  toggleButtonActive: {
    backgroundColor: '#fff',
    color: '#2196F3',
    fontWeight: 'bold',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  count: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  downloadButtons: {
    display: 'flex',
    gap: '5px',
  },
  downloadButton: {
    padding: '6px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    color: '#333',
    transition: 'all 0.2s',
  },
  outputContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: '15px',
    borderRadius: '6px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  empty: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: '20px',
  },
  event: {
    marginBottom: '15px',
    paddingBottom: '15px',
    borderBottom: '1px solid #333',
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  timestamp: {
    color: '#569cd6',
    fontSize: '12px',
  },
  eventType: {
    color: '#4ec9b0',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  eventData: {
    paddingLeft: '10px',
  },
  field: {
    marginBottom: '4px',
  },
  fieldKey: {
    color: '#9cdcfe',
  },
  fieldValue: {
    color: '#ce9178',
  },
  fieldValueHighlight: {
    color: '#dcdcaa',
    fontWeight: 'bold',
  },
};
