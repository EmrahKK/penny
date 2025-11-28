import React, { useEffect, useRef, useState } from 'react';
import { GadgetOutput } from '../types';

interface Node {
  id: string;
  label: string;
  type: 'pod' | 'service' | 'external';
  namespace?: string; // Kubernetes namespace
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  connections: number;
  podCount?: number; // For grouped pod nodes
  pods?: Set<string>; // Track individual pod names in the group
}

interface Connection {
  from: Node;
  to: Node;
  count: number;
  errorCount: number;
  lastSeen: number;
  particles: Particle[];
  eventType: string; // 'accept' or 'connect'
}

interface Particle {
  progress: number;
  speed: number;
}

interface Props {
  outputs: GadgetOutput[];
}

export const TCPFlowDiagram: React.FC<Props> = ({ outputs }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [connections, setConnections] = useState<Map<string, Connection>>(new Map());
  const [stats, setStats] = useState({ nodes: 0, connections: 0, flows: 0, errors: 0 });
  const animationFrameRef = useRef<number>();
  const [showLabels, setShowLabels] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1.0); // Zoom level: 0.5 to 2.0
  const [pan, setPan] = useState({ x: 0, y: 0 }); // Pan offset
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [availableNamespaces, setAvailableNamespaces] = useState<Set<string>>(new Set());
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());

  // Load saved positions from localStorage
  const loadSavedPositions = (): Map<string, { x: number; y: number }> => {
    try {
      const saved = localStorage.getItem('tcpflow-node-positions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.error('Failed to load saved positions:', e);
    }
    return new Map();
  };

  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(loadSavedPositions());

  // Save positions to localStorage when nodes are dragged
  const saveNodePosition = (nodeId: string, x: number, y: number) => {
    savedPositionsRef.current.set(nodeId, { x, y });
    try {
      const positionsObj = Object.fromEntries(savedPositionsRef.current);
      localStorage.setItem('tcpflow-node-positions', JSON.stringify(positionsObj));
    } catch (e) {
      console.error('Failed to save positions:', e);
    }
  };

  // Node colors by type
  const nodeColors = {
    pod: '#4CAF50',
    service: '#2196F3',
    external: '#FF9800',
  };

  // Parse TCP event and extract source/destination info
  const parseEvent = (output: GadgetOutput) => {
    const data = output.data;
    const eventType = data.type as string;

    // Extract source info with k8s.owner for grouping
    const srcInfo = {
      pod: data.k8s?.podName || data.k8s?.pod || 'unknown',
      namespace: data.k8s?.namespace || 'unknown',
      ip: typeof data.src === 'object' ? (data.src.addr || 'unknown') : (data.src || 'unknown'),
      port: typeof data.src === 'object' ? String(data.src.port || 0) : '0',
      eventType,
      owner: data.k8s?.owner || null, // Extract owner (Deployment, StatefulSet, etc.)
    };

    // Extract destination info with Kubernetes service/pod name if available
    let dstLabel = '';
    let dstType: 'pod' | 'service' | 'external' = 'external';
    const isAcceptEvent = eventType === 'accept';

    if (typeof data.dst === 'object' && data.dst.k8s) {
      const dstK8s = data.dst.k8s;
      const dstPort = data.dst.port || 0;

      // Check if it's a valid Kubernetes resource (not raw or empty)
      if (dstK8s.kind === 'svc' && dstK8s.name) {
        // Service destination - for accept events, don't include ephemeral port
        if (isAcceptEvent) {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.svc`;
        } else {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.svc:${dstPort}`;
        }
        dstType = 'service';
      } else if (dstK8s.kind === 'pod' && dstK8s.name) {
        // Pod destination (headless service) - for accept events, don't include ephemeral port
        if (isAcceptEvent) {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.pod`;
        } else {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.pod:${dstPort}`;
        }
        dstType = 'pod';
      } else if (dstK8s.kind === 'raw' || !dstK8s.name) {
        // Raw/external destination - fall through to IP:port handling
        dstLabel = '';
      } else {
        // Other Kubernetes resource with name - for accept events, don't include ephemeral port
        if (isAcceptEvent) {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}`;
        } else {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}:${dstPort}`;
        }
        dstType = 'service';
      }
    }

    // Fallback to IP:port if no Kubernetes info
    if (!dstLabel) {
      const dstIp = typeof data.dst === 'object' ? (data.dst.addr || 'unknown') : (data.dst || 'unknown');
      const dstPort = typeof data.dst === 'object' ? String(data.dst.port || 0) : '0';

      // For accept events, don't include ephemeral port in the label
      if (isAcceptEvent) {
        dstLabel = dstIp;
      } else {
        dstLabel = `${dstIp}:${dstPort}`;
      }

      // Check if it's a raw kind (external IP)
      const isRaw = typeof data.dst === 'object' && data.dst.k8s && data.dst.k8s.kind === 'raw';

      // Determine type: raw is always external, otherwise check IP range
      if (isRaw) {
        dstType = 'external';
      } else if (dstIp.startsWith('10.') || dstIp.startsWith('172.')) {
        dstType = 'service';
      } else {
        dstType = 'external';
      }
    }

    const dstInfo = {
      label: dstLabel,
      type: dstType,
    };

    return { srcInfo, dstInfo };
  };

  // Create or get node with smart hierarchical layout
  const getOrCreateNode = (
    id: string,
    label: string,
    type: 'pod' | 'service' | 'external',
    nodesMap: Map<string, Node>,
    namespace?: string
  ): Node => {
    if (nodesMap.has(id)) {
      return nodesMap.get(id)!;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error('Canvas not ready');
    }

    let x: number;
    let y: number;

    // Check if we have a saved position for this node
    const savedPos = savedPositionsRef.current.get(id);
    if (savedPos) {
      x = savedPos.x;
      y = savedPos.y;
    } else {
      // Smart hierarchical layout: pods on left, services/external on right
      const padding = 100;
      const verticalSpacing = 80;

      if (type === 'pod') {
        // Count existing pod nodes to stack vertically
        const podCount = Array.from(nodesMap.values()).filter(n => n.type === 'pod').length;
        x = padding + 50; // Left side
        y = padding + (podCount * verticalSpacing);
      } else if (type === 'service') {
        // Count existing service nodes
        const serviceCount = Array.from(nodesMap.values()).filter(n => n.type === 'service').length;
        x = canvas.width - padding - 50; // Right side
        y = padding + (serviceCount * verticalSpacing);
      } else {
        // External IPs - far right
        const externalCount = Array.from(nodesMap.values()).filter(n => n.type === 'external').length;
        x = canvas.width - padding - 150;
        y = padding + (externalCount * verticalSpacing);
      }

      // Keep nodes within canvas bounds
      y = Math.min(y, canvas.height - padding);
    }

    const node: Node = {
      id,
      label,
      type,
      namespace,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: type === 'pod' ? 25 : 20,
      color: nodeColors[type],
      connections: 0,
    };

    nodesMap.set(id, node);
    return node;
  };

  // Process outputs and build graph
  useEffect(() => {
    if (outputs.length === 0) return;

    const newNodes = new Map(nodes);
    const newConnections = new Map(connections);
    const now = Date.now();
    const namespaces = new Set<string>();

    // Process last N events to build current state
    const recentEvents = outputs.slice(-100);

    recentEvents.forEach((output) => {
      try {
        const { srcInfo, dstInfo } = parseEvent(output);

        // Skip close events - they don't represent active traffic flows
        if (srcInfo.eventType === 'close') {
          return;
        }

        // Collect namespaces
        if (srcInfo.namespace && srcInfo.namespace !== 'unknown') {
          namespaces.add(srcInfo.namespace);
        }

        // Apply namespace filter if any namespaces are selected
        if (selectedNamespaces.size > 0 && !selectedNamespaces.has(srcInfo.namespace)) {
          return; // Skip events from non-selected namespaces
        }

        const hasError = output.data.error && output.data.error !== 0;

        // Create source node grouped by k8s.owner (Deployment, StatefulSet, etc.)
        let srcId: string;
        if (srcInfo.owner && srcInfo.owner.name && srcInfo.owner.kind) {
          // Group by owner workload
          srcId = `workload:${srcInfo.namespace}/${srcInfo.owner.kind}/${srcInfo.owner.name}`;
        } else {
          // Fallback to individual pod if no owner info
          srcId = `pod:${srcInfo.namespace}/${srcInfo.pod}`;
        }

        // Create node with temporary label (will be updated after pod count)
        const srcNode = getOrCreateNode(srcId, '', 'pod', newNodes, srcInfo.namespace);

        // Track individual pod in the group
        if (!srcNode.pods) {
          srcNode.pods = new Set();
        }
        srcNode.pods.add(srcInfo.pod);
        srcNode.podCount = srcNode.pods.size;

        // Update label with 2 lines: name + kind, namespace
        if (srcInfo.owner && srcInfo.owner.name && srcInfo.owner.kind) {
          srcNode.label = `${srcInfo.owner.name} ${srcInfo.owner.kind}\n${srcInfo.namespace}`;
        } else {
          srcNode.label = `${srcInfo.pod}\n${srcInfo.namespace}`;
        }

        // Create destination node (service/pod/external)
        const dstId = `dst:${dstInfo.label}`;
        const dstNode = getOrCreateNode(dstId, dstInfo.label, dstInfo.type, newNodes);

        // For accept events, reverse the flow direction (dst -> src)
        // For connect events, keep normal direction (src -> dst)
        const isAccept = srcInfo.eventType === 'accept';
        const fromNode = isAccept ? dstNode : srcNode;
        const toNode = isAccept ? srcNode : dstNode;
        const connId = `${fromNode.id}->${toNode.id}`;

        // Create or update connection
        if (newConnections.has(connId)) {
          const conn = newConnections.get(connId)!;
          conn.count++;
          if (hasError) {
            conn.errorCount++;
          }
          conn.lastSeen = now;
        } else {
          srcNode.connections++;
          dstNode.connections++;

          const particles: Particle[] = [];
          for (let i = 0; i < 3; i++) {
            particles.push({
              progress: i / 3,
              speed: 0.005,
            });
          }

          newConnections.set(connId, {
            from: fromNode,
            to: toNode,
            count: 1,
            errorCount: hasError ? 1 : 0,
            lastSeen: now,
            particles,
            eventType: srcInfo.eventType,
          });
        }
      } catch (err) {
        console.error('Error parsing event:', err);
      }
    });

    // Remove old connections (not seen in last 10 minutes)
    // This keeps historical connections visible for a longer period
    newConnections.forEach((conn, key) => {
      if (now - conn.lastSeen > 600000) {
        newConnections.delete(key);
      }
    });

    setNodes(newNodes);
    setConnections(newConnections);
    setAvailableNamespaces(namespaces);

    const totalErrors = Array.from(newConnections.values()).reduce((sum, c) => sum + c.errorCount, 0);

    setStats({
      nodes: newNodes.size,
      connections: newConnections.size,
      flows: Array.from(newConnections.values()).reduce((sum, c) => sum + c.particles.length, 0),
      errors: totalErrors,
    });
  }, [outputs, selectedNamespaces]);

  // Draw node
  const drawNode = (ctx: CanvasRenderingContext2D, node: Node) => {
    const isDark = document.documentElement.classList.contains('dark');

    // Draw glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = node.color;

    // Special rendering for grouped pod nodes (similar to Redis cluster)
    if (node.type === 'pod' && node.podCount && node.podCount > 1) {
      // Draw cluster background with dashed border
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw multiple smaller circles to represent pods in the group
      const maxPods = Math.min(node.podCount, 6); // Show max 6 pods visually
      const miniNodes = [];

      if (maxPods === 1) {
        miniNodes.push({ angle: 0, offset: 0 });
      } else {
        for (let i = 0; i < maxPods; i++) {
          miniNodes.push({
            angle: (i * 360) / maxPods,
            offset: 12,
          });
        }
      }

      miniNodes.forEach((mini) => {
        const rad = (mini.angle * Math.PI) / 180;
        const mx = node.x + Math.cos(rad) * mini.offset;
        const my = node.y + Math.sin(rad) * mini.offset;

        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = isDark ? '#fff' : '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    } else {
      // Draw regular node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.strokeStyle = isDark ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Draw connection count badge
    if (node.connections > 0) {
      ctx.beginPath();
      ctx.arc(node.x + node.radius - 5, node.y - node.radius + 5, 8, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#fff' : '#000';
      ctx.fill();
      ctx.fillStyle = isDark ? '#000' : '#fff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(node.connections), node.x + node.radius - 5, node.y - node.radius + 5);
    }

    // Draw label - dark text for light mode, light text for dark mode
    if (showLabels) {
      ctx.fillStyle = isDark ? '#fff' : '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const lines = node.label.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, node.x, node.y + node.radius + 5 + i * 14);
      });

      // Add pod count for grouped nodes
      if (node.type === 'pod' && node.podCount && node.podCount > 1) {
        ctx.fillStyle = isDark ? '#fff' : '#000';
        ctx.font = '11px Arial';
        ctx.fillText(`(${node.podCount} pods)`, node.x, node.y + node.radius + 5 + lines.length * 14);
      }
    }
  };

  // Draw connection
  const drawConnection = (ctx: CanvasRenderingContext2D, conn: Connection) => {
    const fromX = conn.from.x;
    const fromY = conn.from.y;
    const toX = conn.to.x;
    const toY = conn.to.y;

    const hasError = conn.errorCount > 0;
    const isAccept = conn.eventType === 'accept';
    const isDark = document.documentElement.classList.contains('dark');

    // Different colors for accept vs connect flows
    const flowColor = isAccept ? '#9C27B0' : '#4CAF50'; // Purple for accept, green for connect

    // Draw connection line
    const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);

    if (hasError && showErrorsOnly) {
      // Highlight errors with bright red gradient
      gradient.addColorStop(0, 'rgba(255, 82, 82, 0.6)');
      gradient.addColorStop(1, 'rgba(255, 82, 82, 0.3)');
      ctx.lineWidth = 3;
    } else if (!hasError && showErrorsOnly) {
      // Dim normal connections when highlighting errors
      if (isDark) {
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      } else {
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
      }
      ctx.lineWidth = Math.max(1, Math.min(5, conn.count / 10));
    } else {
      // Normal gradient - dark lines for light mode, light lines for dark mode
      if (isDark) {
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
      } else {
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      }
      ctx.lineWidth = Math.max(1, Math.min(5, conn.count / 10));
    }

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Draw bandwidth label at midpoint
    if (showLabels) {
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;

      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text = hasError
        ? `${conn.count} flows (${conn.errorCount} errors)`
        : `${conn.count} flows`;
      const textWidth = ctx.measureText(text).width;

      // Label background - light background for light mode, dark for dark mode
      ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(midX - textWidth / 2 - 4, midY - 8, textWidth + 8, 16);

      // Label text - white for dark mode, dark for light mode
      ctx.fillStyle = hasError ? '#ff5252' : (isDark ? '#fff' : '#000');
      ctx.fillText(text, midX, midY);
    }

    // Draw particles with different colors for accept vs connect
    if (!isPaused) {
      conn.particles.forEach((particle) => {
        const x = fromX + (toX - fromX) * particle.progress;
        const y = fromY + (toY - fromY) * particle.progress;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = hasError ? '#ff5252' : flowColor;
        ctx.fill();

        // Update particle
        particle.progress += particle.speed;
        if (particle.progress > 1) {
          particle.progress = 0;
        }
      });
    }
  };

  // Zoom functions
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 2.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleZoomReset = () => {
    setZoom(1.0);
  };

  // Reset layout - clear saved positions and recalculate node positions
  const handleResetLayout = () => {
    savedPositionsRef.current.clear();
    localStorage.removeItem('tcpflow-node-positions');

    // Recalculate positions for all existing nodes
    const canvas = canvasRef.current;
    if (!canvas || nodes.size === 0) return;

    const newNodes = new Map(nodes);
    const padding = 100;
    const verticalSpacing = 80;

    // Separate nodes by type
    const podNodes = Array.from(newNodes.values()).filter(n => n.type === 'pod');
    const serviceNodes = Array.from(newNodes.values()).filter(n => n.type === 'service');
    const externalNodes = Array.from(newNodes.values()).filter(n => n.type === 'external');

    // Reposition pods on the left
    podNodes.forEach((node, index) => {
      node.x = padding + 50;
      node.y = padding + (index * verticalSpacing);
    });

    // Reposition services on the right
    serviceNodes.forEach((node, index) => {
      node.x = canvas.width - padding - 50;
      node.y = padding + (index * verticalSpacing);
    });

    // Reposition external IPs
    externalNodes.forEach((node, index) => {
      node.x = canvas.width - padding - 150;
      node.y = padding + (index * verticalSpacing);
    });

    setNodes(newNodes);
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas with gradient background (light or dark based on theme)
    const isDark = document.documentElement.classList.contains('dark');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (isDark) {
      gradient.addColorStop(0, '#0f172a'); // slate-900
      gradient.addColorStop(1, '#1e293b'); // slate-800
    } else {
      gradient.addColorStop(0, '#f1f5f9'); // slate-100
      gradient.addColorStop(1, '#e2e8f0'); // slate-200
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply pan transformation
    ctx.translate(pan.x, pan.y);

    // Apply zoom transformation from center of canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);
    ctx.translate(-centerX, -centerY);

    // Draw all connections (no filtering, just highlighting)
    connections.forEach((conn) => {
      drawConnection(ctx, conn);
    });

    // Draw nodes on top
    nodes.forEach((node) => drawNode(ctx, node));

    // Restore context state
    ctx.restore();

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Convert screen coordinates to canvas coordinates accounting for zoom and pan
  const screenToCanvas = (screenX: number, screenY: number, canvas: HTMLCanvasElement) => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Remove pan offset
    const x1 = screenX - pan.x;
    const y1 = screenY - pan.y;

    // Remove zoom transformation
    const x2 = (x1 - centerX) / zoom + centerX;
    const y2 = (y1 - centerY) / zoom + centerY;

    return { x: x2, y: y2 };
  };

  // Mouse event handlers for dragging nodes and panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x: canvasX, y: canvasY } = screenToCanvas(screenX, screenY, canvas);

    // Check if clicking on a node
    for (const node of nodes.values()) {
      const dx = canvasX - node.x;
      const dy = canvasY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < node.radius) {
        setDraggedNode(node);
        setDragOffset({ x: dx, y: dy });
        canvas.style.cursor = 'grabbing';
        return;
      }
    }

    // If not clicking on a node, start panning
    setIsPanning(true);
    setPanStart({ x: screenX - pan.x, y: screenY - pan.y });
    canvas.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (draggedNode) {
      // Update dragged node position
      const { x: canvasX, y: canvasY } = screenToCanvas(screenX, screenY, canvas);
      const newNodes = new Map(nodes);
      const node = newNodes.get(draggedNode.id);
      if (node) {
        node.x = canvasX - dragOffset.x;
        node.y = canvasY - dragOffset.y;
        // Save position to localStorage
        saveNodePosition(node.id, node.x, node.y);
        setNodes(newNodes);
      }
    } else if (isPanning) {
      // Update pan position
      setPan({
        x: screenX - panStart.x,
        y: screenY - panStart.y,
      });
    } else {
      // Check if hovering over a node to change cursor
      const { x: canvasX, y: canvasY } = screenToCanvas(screenX, screenY, canvas);
      let hovering = false;
      for (const node of nodes.values()) {
        const dx = canvasX - node.x;
        const dy = canvasY - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < node.radius) {
          hovering = true;
          break;
        }
      }
      canvas.style.cursor = hovering ? 'grab' : 'default';
    }
  };

  const handleMouseUp = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'default';
    }
    setDraggedNode(null);
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setDraggedNode(null);
    setIsPanning(false);
  };

  // Handle mouse wheel for zooming
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.5, Math.min(2.0, prev + delta)));
  };

  // Handle namespace filter toggle
  const toggleNamespace = (namespace: string) => {
    const newSelected = new Set(selectedNamespaces);
    if (newSelected.has(namespace)) {
      newSelected.delete(namespace);
    } else {
      newSelected.add(namespace);
    }
    setSelectedNamespaces(newSelected);
  };

  const clearNamespaceFilter = () => {
    setSelectedNamespaces(new Set());
  };

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  // Setup canvas and start animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = isFullscreen ? window.innerHeight - 100 : 500;
    }

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [nodes, connections, showLabels, isPaused, isFullscreen, zoom]);

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-[9999] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800' : 'relative bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 rounded-lg overflow-hidden h-full'}>
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 flex-wrap max-w-[calc(100%-180px)]">
        <button
          onClick={() => setShowLabels(!showLabels)}
          className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1.5 rounded text-sm transition-colors"
        >
          {showLabels ? 'Hide Labels' : 'Show Labels'}
        </button>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1.5 rounded text-sm transition-colors"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => setShowErrorsOnly(!showErrorsOnly)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            showErrorsOnly
              ? 'bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30'
              : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/30'
          }`}
        >
          {showErrorsOnly ? 'Normal View' : 'Highlight Errors'}
        </button>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            isFullscreen
              ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30'
              : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-500/30'
          }`}
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button
          onClick={handleResetLayout}
          className="bg-purple-500/20 text-purple-700 dark:text-purple-400 hover:bg-purple-500/30 px-3 py-1.5 rounded text-sm transition-colors"
          title="Reset node positions to default layout"
        >
          Reset Layout
        </button>
        <button
          onClick={handleZoomIn}
          className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1.5 rounded text-sm transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1.5 rounded text-sm transition-colors"
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={handleZoomReset}
          className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1.5 rounded text-sm transition-colors"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="block w-full cursor-default"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Stats */}
      <div className="absolute bottom-3 right-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-4 py-2 rounded-lg flex gap-4 text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <div className="flex gap-1.5">
          <span className="text-slate-500 dark:text-slate-500">Nodes:</span>
          <span className="font-bold text-green-600 dark:text-green-400">{stats.nodes}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-slate-500 dark:text-slate-500">Connections:</span>
          <span className="font-bold text-blue-600 dark:text-blue-400">{stats.connections}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-slate-500 dark:text-slate-500">Active Flows:</span>
          <span className="font-bold text-purple-600 dark:text-purple-400">{stats.flows}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-slate-500 dark:text-slate-500">Errors:</span>
          <span className={`font-bold ${stats.errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {stats.errors}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-4 py-3 rounded-lg text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <div className="font-bold mb-2 text-slate-900 dark:text-white">Legend</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white" style={{ backgroundColor: nodeColors.pod }} />
          <span>Kubernetes Pod</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white" style={{ backgroundColor: nodeColors.service }} />
          <span>Internal Service</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white" style={{ backgroundColor: nodeColors.external }} />
          <span>External IP</span>
        </div>
      </div>

      {/* Namespace Filter */}
      {availableNamespaces.size > 0 && (
        <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-4 py-3 rounded-lg text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 max-w-[250px] max-h-[300px] overflow-y-auto">
          <div className="font-bold mb-2 flex justify-between items-center text-slate-900 dark:text-white">
            <span>Namespace Filter</span>
            {selectedNamespaces.size > 0 && (
              <button
                onClick={clearNamespaceFilter}
                className="bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 px-2 py-0.5 rounded text-[10px] ml-2 transition-colors"
              >
                Clear ({selectedNamespaces.size})
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {Array.from(availableNamespaces)
              .sort()
              .map((ns) => (
                <div
                  key={ns}
                  onClick={() => toggleNamespace(ns)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    selectedNamespaces.has(ns)
                      ? 'bg-green-500/20 border border-green-500/50'
                      : 'bg-slate-300 dark:bg-slate-700/50 hover:bg-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedNamespaces.has(ns)}
                    onChange={() => {}}
                    className="cursor-pointer"
                  />
                  <span>{ns}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
