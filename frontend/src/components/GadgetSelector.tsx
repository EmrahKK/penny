import React, { useEffect, useState } from 'react';
import { Gadget, GadgetRequest } from '../types';
import { api } from '../services/api';

interface Props {
  onStartGadget: (request: GadgetRequest) => void;
  disabled?: boolean;
}

export const GadgetSelector: React.FC<Props> = ({ onStartGadget, disabled }) => {
  const [gadgets, setGadgets] = useState<Gadget[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [namespace, setNamespace] = useState<string>('');
  const [podName, setPodName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  // TCP trace flags
  const [acceptOnly, setAcceptOnly] = useState(false);
  const [connectOnly, setConnectOnly] = useState(false);
  const [failureOnly, setFailureOnly] = useState(false);

  useEffect(() => {
    loadGadgets();
  }, []);

  const loadGadgets = async () => {
    try {
      const data = await api.getGadgets();
      setGadgets(data);
      if (data.length > 0) {
        setSelectedType(data[0].type);
      }
    } catch (error) {
      console.error('Failed to load gadgets:', error);
    }
  };

  const handleStart = async () => {
    if (!selectedType) return;

    setLoading(true);
    try {
      const request: GadgetRequest = {
        type: selectedType as any,
        namespace: namespace || undefined,
        podName: podName || undefined,
        acceptOnly: acceptOnly || undefined,
        connectOnly: connectOnly || undefined,
        failureOnly: failureOnly || undefined,
      };
      await onStartGadget(request);
      // Reset form
      setNamespace('');
      setPodName('');
      setAcceptOnly(false);
      setConnectOnly(false);
      setFailureOnly(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Start Gadget</h2>

      <div style={styles.formGroup}>
        <label style={styles.label}>Gadget Type:</label>
        <select
          style={styles.select}
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          disabled={disabled || loading}
        >
          {gadgets.map((gadget) => (
            <option key={gadget.type} value={gadget.type}>
              {gadget.name} - {gadget.description}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Namespace (optional):</label>
        <input
          style={styles.input}
          type="text"
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          placeholder="default"
          disabled={disabled || loading}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Pod Name (optional):</label>
        <input
          style={styles.input}
          type="text"
          value={podName}
          onChange={(e) => setPodName(e.target.value)}
          placeholder="Leave empty to trace all pods"
          disabled={disabled || loading}
        />
      </div>

      {selectedType === 'trace_tcp' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>TCP Trace Options:</label>
          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={acceptOnly}
                onChange={(e) => setAcceptOnly(e.target.checked)}
                disabled={disabled || loading}
                style={styles.checkbox}
              />
              Accept Only (--accept-only)
            </label>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={connectOnly}
                onChange={(e) => setConnectOnly(e.target.checked)}
                disabled={disabled || loading}
                style={styles.checkbox}
              />
              Connect Only (--connect-only)
            </label>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={failureOnly}
                onChange={(e) => setFailureOnly(e.target.checked)}
                disabled={disabled || loading}
                style={styles.checkbox}
              />
              Failure Only (--failure-only)
            </label>
          </div>
        </div>
      )}

      <button
        style={{
          ...styles.button,
          ...(disabled || loading ? styles.buttonDisabled : {}),
        }}
        onClick={handleStart}
        disabled={disabled || loading || !selectedType}
      >
        {loading ? 'Starting...' : 'Start Gadget'}
      </button>
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
    marginBottom: '20px',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  formGroup: {
    marginBottom: '15px',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  button: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '8px',
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    marginRight: '8px',
    cursor: 'pointer',
  },
};
