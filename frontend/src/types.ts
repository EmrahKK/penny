export type GadgetType = 'trace_sni' | 'trace_tcp' | 'snapshot_process' | 'snapshot_socket';

export interface Gadget {
  type: GadgetType;
  name: string;
  description: string;
  category: string;
}

export interface GadgetRequest {
  type: GadgetType;
  namespace?: string;
  podName?: string;
  container?: string;
  params?: Record<string, any>;
  // TCP trace specific flags
  acceptOnly?: boolean;
  connectOnly?: boolean;
  failureOnly?: boolean;
}

export interface GadgetSession {
  id: string;
  type: GadgetType;
  namespace: string;
  podName?: string;
  startTime?: string;
  status: string;
  timeout?: number; // in nanoseconds
  acceptOnly?: boolean;
  connectOnly?: boolean;
  failureOnly?: boolean;
}

export interface GadgetOutput {
  sessionId: string;
  timestamp: string;
  data: Record<string, any>;
  eventType: string;
}
