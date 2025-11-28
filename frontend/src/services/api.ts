import axios from 'axios';
import { Gadget, GadgetRequest, GadgetSession } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = {
  async getGadgets(): Promise<Gadget[]> {
    const response = await axios.get(`${API_BASE_URL}/gadgets`);
    return response.data;
  },

  async getSessions(): Promise<GadgetSession[]> {
    const response = await axios.get(`${API_BASE_URL}/sessions`);
    return response.data;
  },

  async startSession(request: GadgetRequest): Promise<GadgetSession> {
    const response = await axios.post(`${API_BASE_URL}/sessions`, request);
    return response.data;
  },

  async stopSession(sessionId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
  },

  getWebSocketUrl(sessionId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || window.location.host;
    return `${protocol}//${host}/ws/${sessionId}`;
  },

  // Historical data queries
  async queryEvents(filters: {
    event_type?: string;
    namespace?: string;
    session_id?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await axios.get(`${API_BASE_URL}/events?${params.toString()}`);
    return response.data || [];
  },

  async getSessionEvents(sessionId: string, limit?: number): Promise<any[]> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/events${params}`);
    return response.data || [];
  },

  async getSessionStats(sessionId: string): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/stats`);
    return response.data;
  },
};
