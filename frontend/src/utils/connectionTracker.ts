import { GadgetOutput } from '../types';

export interface Connection {
  id: string;
  type: 'connect' | 'accept';
  srcAddr: string;
  srcPort: number;
  dstAddr: string;
  dstPort: number;
  srcName?: string;
  dstName?: string;
  pod: string;
  namespace: string;
  process: string;
  pid: number;
  fd: number;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  status: 'active' | 'closed';
  error?: number;
}

export class ConnectionTracker {
  private connections: Map<string, Connection>;
  private closedConnections: Connection[];

  constructor() {
    this.connections = new Map();
    this.closedConnections = [];
  }

  /**
   * Generate a unique key for a connection based on endpoints and process
   */
  private generateConnectionKey(
    srcAddr: string,
    srcPort: number,
    dstAddr: string,
    dstPort: number,
    pid: number,
    fd: number
  ): string {
    // Use both directions since close events might have swapped src/dst
    return `${srcAddr}:${srcPort}-${dstAddr}:${dstPort}-${pid}-${fd}`;
  }

  /**
   * Generate alternate key with swapped src/dst for close event matching
   */
  private generateAlternateKey(
    srcAddr: string,
    srcPort: number,
    dstAddr: string,
    dstPort: number,
    pid: number,
    fd: number
  ): string {
    return `${dstAddr}:${dstPort}-${srcAddr}:${srcPort}-${pid}-${fd}`;
  }

  /**
   * Process a TCP trace event and update connection tracking
   */
  processEvent(output: GadgetOutput): void {
    const { data } = output;
    const eventType = data.type as string;

    if (!eventType || !data.src || !data.dst || !data.proc) {
      return;
    }

    if (eventType === 'connect' || eventType === 'accept') {
      this.handleConnectOrAccept(output, eventType as 'connect' | 'accept');
    } else if (eventType === 'close') {
      this.handleClose(output);
    }
  }

  private handleConnectOrAccept(output: GadgetOutput, type: 'connect' | 'accept'): void {
    const { data, timestamp } = output;
    const srcAddr = data.src.addr as string;
    const srcPort = data.src.port as number;
    const dstAddr = data.dst.addr as string;
    const dstPort = data.dst.port as number;
    const pid = data.proc.pid as number;
    const fd = data.fd as number;
    const error = data.error as number;

    const key = this.generateConnectionKey(srcAddr, srcPort, dstAddr, dstPort, pid, fd);

    // Extract names
    let srcName: string | undefined;
    let dstName: string | undefined;

    if (data.src.k8s) {
      const srcK8s = data.src.k8s as any;
      if (srcK8s.kind === 'svc' && srcK8s.name) {
        srcName = `${srcK8s.name}.${srcK8s.namespace}.svc`;
      } else if (srcK8s.kind === 'pod' && srcK8s.name) {
        srcName = `${srcK8s.name}.${srcK8s.namespace}.pod`;
      }
    }

    if (data.dst.k8s) {
      const dstK8s = data.dst.k8s as any;
      if (dstK8s.kind === 'svc' && dstK8s.name) {
        dstName = `${dstK8s.name}.${dstK8s.namespace}.svc`;
      } else if (dstK8s.kind === 'pod' && dstK8s.name) {
        dstName = `${dstK8s.name}.${dstK8s.namespace}.pod`;
      }
    }

    const connection: Connection = {
      id: key,
      type,
      srcAddr,
      srcPort,
      dstAddr,
      dstPort,
      srcName,
      dstName,
      pod: (data.k8s?.podName as string) || 'unknown',
      namespace: (data.k8s?.namespace as string) || 'unknown',
      process: (data.proc.comm as string) || 'unknown',
      pid,
      fd,
      startTime: new Date(timestamp),
      status: error === 0 ? 'active' : 'closed',
      error: error !== 0 ? error : undefined,
    };

    // If connection failed immediately, add to closed
    if (error !== 0) {
      connection.endTime = new Date(timestamp);
      connection.duration = 0;
      this.closedConnections.push(connection);
    } else {
      this.connections.set(key, connection);
    }
  }

  private handleClose(output: GadgetOutput): void {
    const { data, timestamp } = output;
    const srcAddr = data.src.addr as string;
    const srcPort = data.src.port as number;
    const dstAddr = data.dst.addr as string;
    const dstPort = data.dst.port as number;
    const pid = data.proc.pid as number;
    const fd = data.fd as number;

    // Try both normal and alternate keys
    const key1 = this.generateConnectionKey(srcAddr, srcPort, dstAddr, dstPort, pid, fd);
    const key2 = this.generateAlternateKey(srcAddr, srcPort, dstAddr, dstPort, pid, fd);

    let connection = this.connections.get(key1);
    let matchedKey = key1;

    if (!connection) {
      connection = this.connections.get(key2);
      matchedKey = key2;
    }

    if (connection) {
      // Found matching connection
      connection.endTime = new Date(timestamp);
      connection.duration = connection.endTime.getTime() - connection.startTime.getTime();
      connection.status = 'closed';
      connection.error = data.error as number;

      this.closedConnections.push(connection);
      this.connections.delete(matchedKey);
    } else {
      // Close without matching connect/accept (possibly missed the start event)
      const orphanConnection: Connection = {
        id: key1,
        type: 'connect', // Unknown, assume connect
        srcAddr,
        srcPort,
        dstAddr,
        dstPort,
        pod: (data.k8s?.podName as string) || 'unknown',
        namespace: (data.k8s?.namespace as string) || 'unknown',
        process: (data.proc.comm as string) || 'unknown',
        pid,
        fd,
        startTime: new Date(timestamp), // Same as end time since we don't know start
        endTime: new Date(timestamp),
        duration: 0,
        status: 'closed',
        error: data.error as number,
      };
      this.closedConnections.push(orphanConnection);
    }
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get all closed connections
   */
  getClosedConnections(): Connection[] {
    return this.closedConnections;
  }

  /**
   * Get all connections (active + closed)
   */
  getAllConnections(): Connection[] {
    return [...this.getActiveConnections(), ...this.closedConnections];
  }

  /**
   * Get connection statistics
   */
  getStatistics() {
    const active = this.getActiveConnections();
    const closed = this.getClosedConnections();
    const all = this.getAllConnections();

    const avgDuration =
      closed.length > 0
        ? closed.reduce((sum, conn) => sum + (conn.duration || 0), 0) / closed.length
        : 0;

    const failedConnections = all.filter((conn) => conn.error && conn.error !== 0);

    return {
      activeCount: active.length,
      closedCount: closed.length,
      totalCount: all.length,
      failedCount: failedConnections.length,
      averageDuration: avgDuration,
      successRate:
        all.length > 0 ? ((all.length - failedConnections.length) / all.length) * 100 : 100,
    };
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.connections.clear();
    this.closedConnections = [];
  }
}
