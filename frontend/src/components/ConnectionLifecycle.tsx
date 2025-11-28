import React, { useMemo, useState } from 'react';
import { Connection } from '../utils/connectionTracker';

interface Props {
  connections: Connection[];
  statistics: {
    activeCount: number;
    closedCount: number;
    totalCount: number;
    failedCount: number;
    averageDuration: number;
    successRate: number;
  };
}

export const ConnectionLifecycle: React.FC<Props> = ({ connections, statistics }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConnections = useMemo(() => {
    let filtered = connections;

    // Apply status filter
    if (filter === 'active') {
      filtered = filtered.filter((conn) => conn.status === 'active');
    } else if (filter === 'closed') {
      filtered = filtered.filter((conn) => conn.status === 'closed');
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (conn) =>
          conn.srcAddr.toLowerCase().includes(term) ||
          conn.dstAddr.toLowerCase().includes(term) ||
          conn.srcName?.toLowerCase().includes(term) ||
          conn.dstName?.toLowerCase().includes(term) ||
          conn.pod.toLowerCase().includes(term) ||
          conn.process.toLowerCase().includes(term)
      );
    }

    // Sort by start time (newest first)
    return filtered.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, [connections, filter, searchTerm]);

  const formatDuration = (ms?: number): string => {
    if (ms === undefined) return 'Active';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatTimestamp = (date: Date): string => {
    const time = date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${time}.${ms}`;
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Connection Lifecycle</h2>

      {/* Statistics */}
      <div style={styles.statsContainer}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{statistics.totalCount}</div>
          <div style={styles.statLabel}>Total Connections</div>
        </div>
        <div style={{ ...styles.statCard, ...styles.statCardActive }}>
          <div style={styles.statValue}>{statistics.activeCount}</div>
          <div style={styles.statLabel}>Active</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{statistics.closedCount}</div>
          <div style={styles.statLabel}>Closed</div>
        </div>
        <div style={{ ...styles.statCard, ...styles.statCardError }}>
          <div style={styles.statValue}>{statistics.failedCount}</div>
          <div style={styles.statLabel}>Failed</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatDuration(statistics.averageDuration)}</div>
          <div style={styles.statLabel}>Avg Duration</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{statistics.successRate.toFixed(1)}%</div>
          <div style={styles.statLabel}>Success Rate</div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterContainer}>
        <div style={styles.filterButtons}>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'all' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('all')}
          >
            All ({connections.length})
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'active' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('active')}
          >
            Active ({statistics.activeCount})
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'closed' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('closed')}
          >
            Closed ({statistics.closedCount})
          </button>
        </div>
        <input
          style={styles.searchInput}
          type="text"
          placeholder="Search by IP, name, pod, or process..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Connections Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Source</th>
              <th style={styles.th}>Destination</th>
              <th style={styles.th}>Pod</th>
              <th style={styles.th}>Process</th>
              <th style={styles.th}>Start Time</th>
              <th style={styles.th}>Duration</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredConnections.length === 0 ? (
              <tr>
                <td colSpan={8} style={styles.emptyRow}>
                  No connections found
                </td>
              </tr>
            ) : (
              filteredConnections.map((conn) => (
                <tr key={conn.id} style={styles.row}>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(conn.type === 'connect'
                          ? styles.badgeConnect
                          : styles.badgeAccept),
                      }}
                    >
                      {conn.type}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.endpoint}>
                      {conn.srcName && <div style={styles.endpointName}>{conn.srcName}</div>}
                      <div style={styles.endpointAddr}>
                        {conn.srcAddr}:{conn.srcPort}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.endpoint}>
                      {conn.dstName && <div style={styles.endpointName}>{conn.dstName}</div>}
                      <div style={styles.endpointAddr}>
                        {conn.dstAddr}:{conn.dstPort}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.podInfo}>
                      <div style={styles.podName}>{conn.pod}</div>
                      <div style={styles.namespace}>{conn.namespace}</div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.processInfo}>
                      <div>{conn.process}</div>
                      <div style={styles.pid}>PID: {conn.pid}</div>
                    </div>
                  </td>
                  <td style={styles.td}>{formatTimestamp(conn.startTime)}</td>
                  <td style={styles.td}>
                    <strong>{formatDuration(conn.duration)}</strong>
                  </td>
                  <td style={styles.td}>
                    {conn.status === 'active' ? (
                      <span style={{ ...styles.badge, ...styles.badgeActive }}>Active</span>
                    ) : conn.error && conn.error !== 0 ? (
                      <span style={{ ...styles.badge, ...styles.badgeError }}>
                        Error ({conn.error})
                      </span>
                    ) : (
                      <span style={{ ...styles.badge, ...styles.badgeClosed }}>Closed</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredConnections.length > 0 && (
        <div style={styles.footer}>
          Showing {filteredConnections.length} of {connections.length} connections
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  title: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginBottom: '20px',
  },
  statCard: {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '6px',
    textAlign: 'center',
    border: '1px solid #e0e0e0',
  },
  statCardActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  statCardError: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '5px',
  },
  statLabel: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase',
  },
  filterContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    gap: '15px',
    flexWrap: 'wrap',
  },
  filterButtons: {
    display: 'flex',
    gap: '10px',
  },
  filterButton: {
    padding: '8px 16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    color: '#fff',
    borderColor: '#007bff',
  },
  searchInput: {
    flex: 1,
    minWidth: '250px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  tableContainer: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: '500px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    backgroundColor: '#f5f5f5',
    padding: '10px',
    textAlign: 'left',
    fontWeight: '600',
    borderBottom: '2px solid #ddd',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #f0f0f0',
  },
  row: {
    cursor: 'default',
  },
  emptyRow: {
    padding: '30px',
    textAlign: 'center',
    color: '#999',
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    display: 'inline-block',
  },
  badgeConnect: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
  },
  badgeAccept: {
    backgroundColor: '#f3e5f5',
    color: '#7b1fa2',
  },
  badgeActive: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  badgeClosed: {
    backgroundColor: '#f5f5f5',
    color: '#616161',
  },
  badgeError: {
    backgroundColor: '#ffebee',
    color: '#c62828',
  },
  endpoint: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  endpointName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#333',
  },
  endpointAddr: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
  },
  podInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  podName: {
    fontSize: '12px',
    fontWeight: '500',
  },
  namespace: {
    fontSize: '11px',
    color: '#666',
  },
  processInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  pid: {
    fontSize: '11px',
    color: '#666',
  },
  footer: {
    marginTop: '15px',
    padding: '10px',
    fontSize: '13px',
    color: '#666',
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
  },
};
