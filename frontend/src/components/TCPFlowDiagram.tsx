import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GadgetOutput } from '../types';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'pod' | 'service' | 'external';
  namespace?: string;
  connections: number;
  podCount?: number;
  pods?: Set<string>;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
  count: number;
  errorCount: number;
  eventType: string;
}

interface Props {
  outputs: GadgetOutput[];
}

export const TCPFlowDiagram: React.FC<Props> = ({ outputs }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [links, setLinks] = useState<Map<string, Link>>(new Map());
  const [stats, setStats] = useState({ nodes: 0, connections: 0, flows: 0, errors: 0 });
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [availableNamespaces, setAvailableNamespaces] = useState<Set<string>>(new Set());
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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
      owner: data.k8s?.owner || null,
    };

    // Extract destination info with Kubernetes service/pod name if available
    let dstLabel = '';
    let dstType: 'pod' | 'service' | 'external' = 'external';
    const isAcceptEvent = eventType === 'accept';

    if (typeof data.dst === 'object' && data.dst.k8s) {
      const dstK8s = data.dst.k8s;
      const dstPort = data.dst.port || 0;

      if (dstK8s.kind === 'svc' && dstK8s.name) {
        if (isAcceptEvent) {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.svc`;
        } else {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.svc:${dstPort}`;
        }
        dstType = 'service';
      } else if (dstK8s.kind === 'pod' && dstK8s.name) {
        if (isAcceptEvent) {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.pod`;
        } else {
          dstLabel = `${dstK8s.name}.${dstK8s.namespace}.pod:${dstPort}`;
        }
        dstType = 'pod';
      } else if (dstK8s.kind === 'raw' || !dstK8s.name) {
        dstLabel = '';
      } else {
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

      if (isAcceptEvent) {
        dstLabel = dstIp;
      } else {
        dstLabel = `${dstIp}:${dstPort}`;
      }

      const isRaw = typeof data.dst === 'object' && data.dst.k8s && data.dst.k8s.kind === 'raw';

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

  // Create or get node
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

    const node: Node = {
      id,
      label,
      type,
      namespace,
      connections: 0,
    };

    nodesMap.set(id, node);
    return node;
  };

  // Process outputs and build graph
  useEffect(() => {
    if (outputs.length === 0) return;

    // Skip updates if live update is disabled
    if (!liveUpdateEnabled) return;

    const newNodes = new Map(nodes);
    const newLinks = new Map(links);
    const namespaces = new Set<string>();

    // Process last N events to build current state
    const recentEvents = outputs.slice(-100);

    recentEvents.forEach((output) => {
      try {
        const { srcInfo, dstInfo } = parseEvent(output);

        // Skip close events
        if (srcInfo.eventType === 'close') {
          return;
        }

        // Collect namespaces
        if (srcInfo.namespace && srcInfo.namespace !== 'unknown') {
          namespaces.add(srcInfo.namespace);
        }

        // Apply namespace filter if any namespaces are selected
        if (selectedNamespaces.size > 0 && !selectedNamespaces.has(srcInfo.namespace)) {
          return;
        }

        const hasError = output.data.error && output.data.error !== 0;

        // Create source node grouped by k8s.owner
        let srcId: string;
        if (srcInfo.owner && srcInfo.owner.name && srcInfo.owner.kind) {
          srcId = `workload:${srcInfo.namespace}/${srcInfo.owner.kind}/${srcInfo.owner.name}`;
        } else {
          srcId = `pod:${srcInfo.namespace}/${srcInfo.pod}`;
        }

        const srcNode = getOrCreateNode(srcId, '', 'pod', newNodes, srcInfo.namespace);

        // Track individual pod in the group
        if (!srcNode.pods) {
          srcNode.pods = new Set();
        }
        srcNode.pods.add(srcInfo.pod);
        srcNode.podCount = srcNode.pods.size;

        // Update label
        if (srcInfo.owner && srcInfo.owner.name && srcInfo.owner.kind) {
          srcNode.label = `${srcInfo.owner.name} ${srcInfo.owner.kind}\n${srcInfo.namespace}`;
        } else {
          srcNode.label = `${srcInfo.pod}\n${srcInfo.namespace}`;
        }

        // Create destination node
        const dstId = `dst:${dstInfo.label}`;
        const dstNode = getOrCreateNode(dstId, dstInfo.label, dstInfo.type, newNodes);

        // For accept events, reverse the flow direction
        const isAccept = srcInfo.eventType === 'accept';
        const fromNode = isAccept ? dstNode : srcNode;
        const toNode = isAccept ? srcNode : dstNode;
        const linkId = `${fromNode.id}->${toNode.id}`;

        // Create or update link
        if (newLinks.has(linkId)) {
          const link = newLinks.get(linkId)!;
          link.count++;
          if (hasError) {
            link.errorCount++;
          }
        } else {
          srcNode.connections++;
          dstNode.connections++;

          newLinks.set(linkId, {
            source: fromNode,
            target: toNode,
            count: 1,
            errorCount: hasError ? 1 : 0,
            eventType: srcInfo.eventType,
          });
        }
      } catch (err) {
        console.error('Error parsing event:', err);
      }
    });

    setNodes(newNodes);
    setLinks(newLinks);
    setAvailableNamespaces(namespaces);

    const totalErrors = Array.from(newLinks.values()).reduce((sum, l) => sum + l.errorCount, 0);

    setStats({
      nodes: newNodes.size,
      connections: newLinks.size,
      flows: newLinks.size,
      errors: totalErrors,
    });
  }, [outputs, selectedNamespaces, liveUpdateEnabled]);

  // D3 force simulation and rendering
  useEffect(() => {
    if (!svgRef.current || nodes.size === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous content
    svg.selectAll('*').remove();

    const isDark = document.documentElement.classList.contains('dark');

    // Create container group for zoom/pan
    const container = svg.append('g');

    // Define arrow markers
    const defs = svg.append('defs');

    // Arrow for normal flows (green)
    defs
      .append('marker')
      .attr('id', 'arrow-normal')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#4CAF50')
      .attr('d', 'M0,-5L10,0L0,5');

    // Arrow for accept flows (purple)
    defs
      .append('marker')
      .attr('id', 'arrow-accept')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#9C27B0')
      .attr('d', 'M0,-5L10,0L0,5');

    // Arrow for error flows (red)
    defs
      .append('marker')
      .attr('id', 'arrow-error')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#ff5252')
      .attr('d', 'M0,-5L10,0L0,5');

    const nodesArray = Array.from(nodes.values());
    const linksArray = Array.from(links.values());

    // Create force simulation with parameters similar to disjoint graph
    const simulation = d3
      .forceSimulation<Node>(nodesArray)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(linksArray)
          .id((d) => d.id)
          .distance(150)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-800))
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('collide', d3.forceCollide().radius(60).strength(0.8));

    simulationRef.current = simulation;

    // Create links with consistent styling (straight lines)
    const link = container
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linksArray)
      .join('line')
      .attr('stroke-width', 2)
      .attr('stroke', (d) => {
        if (d.errorCount > 0) {
          return showErrorsOnly ? '#ff5252' : isDark ? 'rgba(255, 82, 82, 0.7)' : 'rgba(255, 82, 82, 0.6)';
        }
        if (showErrorsOnly) {
          return isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        }
        const isAccept = d.eventType === 'accept';
        return isAccept
          ? isDark ? 'rgba(156, 39, 176, 0.7)' : 'rgba(156, 39, 176, 0.6)'
          : isDark ? 'rgba(76, 175, 80, 0.7)' : 'rgba(76, 175, 80, 0.6)';
      })
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', (d) => {
        if (d.errorCount > 0) return 'url(#arrow-error)';
        const isAccept = d.eventType === 'accept';
        return isAccept ? 'url(#arrow-accept)' : 'url(#arrow-normal)';
      })
      .attr('class', 'link');

    // Create link labels
    const linkLabels = container
      .append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(linksArray)
      .join('text')
      .attr('font-size', 9)      
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => (d.errorCount > 0 ? '#ff5252' : isDark ? '#fff' : '#000'))
      .attr('opacity', 0.8)
      .attr('class', 'link-label')
      .text((d) => (d.errorCount > 0 ? `${d.count} c (${d.errorCount} err)` : `${d.count} c`));

    // Create nodes
    const node = container
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, Node>('g')
      .data(nodesArray)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', function (_event, d) {
        setSelectedNode(d);
      })
      .on('mouseover', function (_event, d) {
        // Highlight this node
        d3.select(this).select('circle').attr('stroke-width', 3);

        // Dim all links and labels
        container.selectAll('.link').attr('stroke-opacity', 0.1);
        container.selectAll('.link-label').attr('opacity', 0.1);

        // Highlight connected links and their labels
        container.selectAll('.link').each(function (linkData: any) {
          const link = linkData as Link;
          if (link.source.id === d.id || link.target.id === d.id) {
            d3.select(this).attr('stroke-opacity', 1);
          }
        });

        container.selectAll('.link-label').each(function (linkData: any) {
          const link = linkData as Link;
          if (link.source.id === d.id || link.target.id === d.id) {
            d3.select(this).attr('opacity', 1);
          }
        });

        // Dim unconnected nodes
        container.selectAll('.node').attr('opacity', 0.2);

        // Highlight connected nodes and this node
        d3.select(this).attr('opacity', 1);
        container.selectAll('.node').each(function (nodeData: any) {
          const node = nodeData as Node;
          const isConnected = linksArray.some(
            (link) =>
              (link.source.id === d.id && link.target.id === node.id) ||
              (link.target.id === d.id && link.source.id === node.id)
          );
          if (isConnected) {
            d3.select(this).attr('opacity', 1);
          }
        });
      })
      .on('mouseout', function () {
        // Reset all styles
        d3.select(this).select('circle').attr('stroke-width', 2);
        container.selectAll('.link').attr('stroke-opacity', 0.6);
        container.selectAll('.link-label').attr('opacity', 0.8);
        container.selectAll('.node').attr('opacity', 1);
      })
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Draw nodes with special rendering for grouped pods
    node.each(function (d) {
      const g = d3.select(this);

      if (d.type === 'pod' && d.podCount && d.podCount > 1) {
        // Draw cluster background
        g.append('circle')
          .attr('r', 30)
          .attr('fill', 'rgba(76, 175, 80, 0.2)')
          .attr('stroke', 'rgba(76, 175, 80, 0.5)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5');

        // Draw mini nodes
        const maxPods = Math.min(d.podCount, 6);
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
          g.append('circle')
            .attr('cx', Math.cos(rad) * mini.offset)
            .attr('cy', Math.sin(rad) * mini.offset)
            .attr('r', 8)
            .attr('fill', nodeColors[d.type])
            .attr('stroke', isDark ? '#fff' : '#000')
            .attr('stroke-width', 1.5);
        });
      } else {
        // Regular node
        g.append('circle')
          .attr('r', d.type === 'pod' ? 25 : 20)
          .attr('fill', nodeColors[d.type])
          .attr('stroke', isDark ? '#fff' : '#000')
          .attr('stroke-width', 2);
      }

      // Connection count badge
      if (d.connections > 0) {
        const radius = d.type === 'pod' ? 25 : 20;
        g.append('circle')
          .attr('cx', radius - 5)
          .attr('cy', -radius + 5)
          .attr('r', 8)
          .attr('fill', isDark ? '#fff' : '#000');

        g.append('text')
          .attr('x', radius - 5)
          .attr('y', -radius + 5)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', 10)
          .attr('font-weight', 'bold')
          .attr('fill', isDark ? '#000' : '#fff')
          .text(d.connections);
      }
    });

    // Add node labels
    const labels = node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => (d.type === 'pod' ? 40 : 35))
      .attr('fill', isDark ? '#fff' : '#000')
      .attr('font-size', 12);

    labels.each(function (d) {
      const text = d3.select(this);
      const lines = d.label.split('\n');
      lines.forEach((line, i) => {
        text
          .append('tspan')
          .attr('x', 0)
          .attr('dy', i === 0 ? 0 : 14)
          .text(line);
      });

      // Add pod count for grouped nodes
      if (d.type === 'pod' && d.podCount && d.podCount > 1) {
        text
          .append('tspan')
          .attr('x', 0)
          .attr('dy', 14)
          .attr('font-size', 11)
          .text(`(${d.podCount} pods)`);
      }
    });

    // Update positions on each tick
    simulation.on('tick', () => {
      // Update links as straight lines
      link
        .attr('x1', (d) => (d.source as Node).x!)
        .attr('y1', (d) => (d.source as Node).y!)
        .attr('x2', (d) => {
          const sourceNode = d.source as Node;
          const targetNode = d.target as Node;
          const dx = targetNode.x! - sourceNode.x!;
          const dy = targetNode.y! - sourceNode.y!;
          const angle = Math.atan2(dy, dx);
          const targetRadius = targetNode.type === 'pod' ? 30 : 25;
          return targetNode.x! - Math.cos(angle) * targetRadius;
        })
        .attr('y2', (d) => {
          const sourceNode = d.source as Node;
          const targetNode = d.target as Node;
          const dx = targetNode.x! - sourceNode.x!;
          const dy = targetNode.y! - sourceNode.y!;
          const angle = Math.atan2(dy, dx);
          const targetRadius = targetNode.type === 'pod' ? 30 : 25;
          return targetNode.y! - Math.sin(angle) * targetRadius;
        });

      linkLabels
        .attr('x', (d) => {
          const sourceNode = d.source as Node;
          const targetNode = d.target as Node;
          return (sourceNode.x! + targetNode.x!) / 2;
        })
        .attr('y', (d) => {
          const sourceNode = d.source as Node;
          const targetNode = d.target as Node;
          return (sourceNode.y! + targetNode.y!) / 2;
        });

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Setup zoom behavior
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
        setZoom(event.transform.k);
      });

    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    return () => {
      simulation.stop();
    };
  }, [nodes, links, showErrorsOnly]);

  // Zoom functions
  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().call(zoomBehaviorRef.current.scaleBy, 1.2);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().call(zoomBehaviorRef.current.scaleBy, 0.8);
    }
  };

  const handleZoomReset = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
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

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800'
          : 'relative bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 rounded-lg overflow-hidden h-full'
      }
    >
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 flex-wrap max-w-[calc(100%-180px)]">
        <button
          onClick={() => setLiveUpdateEnabled(!liveUpdateEnabled)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            liveUpdateEnabled
              ? 'bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30'
              : 'bg-gray-500/20 text-gray-700 dark:text-gray-400 hover:bg-gray-500/30'
          }`}
        >
          {liveUpdateEnabled ? 'Live Updates On' : 'Live Updates Off'}
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

      <svg
        ref={svgRef}
        className="block w-full"
        style={{ height: isFullscreen ? window.innerHeight - 100 : 500 }}
        onClick={(e) => {
          // Close sidebar when clicking on SVG background (not on nodes)
          if (e.target === svgRef.current) {
            setSelectedNode(null);
          }
        }}
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
          <span
            className={`font-bold ${
              stats.errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}
          >
            {stats.errors}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-4 py-3 rounded-lg text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <div className="font-bold mb-2 text-slate-900 dark:text-white">Legend</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white"
            style={{ backgroundColor: nodeColors.pod }}
          />
          <span>Kubernetes Pod</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white"
            style={{ backgroundColor: nodeColors.service }}
          />
          <span>Internal Service</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full border-2 border-slate-900 dark:border-white"
            style={{ backgroundColor: nodeColors.external }}
          />
          <span>External IP</span>
        </div>
      </div>

      {/* Node Details Sidebar */}
      {selectedNode && (
        <div className="absolute top-[180px] right-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-4 py-3 rounded-lg text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 max-w-[320px] max-h-[calc(100vh-200px)] overflow-y-auto shadow-lg">
          {/* Header */}
          <div className="flex justify-between items-start mb-3 pb-2 border-b border-slate-300 dark:border-slate-600">
            <div className="flex-1">
              <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">Node Details</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Click outside to close</div>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Node Info */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full border border-slate-900 dark:border-white"
                style={{ backgroundColor: nodeColors[selectedNode.type] }}
              />
              <span className="font-semibold text-slate-900 dark:text-white capitalize">{selectedNode.type}</span>
            </div>
            <div className="space-y-1">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Name: </span>
                <span className="font-medium break-all">{selectedNode.label.split('\n')[0]}</span>
              </div>
              {selectedNode.namespace && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Namespace: </span>
                  <span className="font-medium">{selectedNode.namespace}</span>
                </div>
              )}
              {selectedNode.podCount && selectedNode.podCount > 1 && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Pods: </span>
                  <span className="font-medium">{selectedNode.podCount}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 dark:text-slate-400">Total Connections: </span>
                <span className="font-medium">{selectedNode.connections}</span>
              </div>
            </div>
          </div>

          {/* Outgoing Connections */}
          {(() => {
            const outgoing = Array.from(links.values()).filter((link) => link.source.id === selectedNode.id);
            return outgoing.length > 0 ? (
              <div className="mb-3">
                <div className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1">
                  <span className="text-green-600 dark:text-green-400">→</span>
                  Outgoing ({outgoing.length})
                </div>
                <div className="space-y-2">
                  {outgoing.map((link, idx) => (
                    <div key={idx} className="bg-slate-100 dark:bg-slate-700/50 p-2 rounded text-[11px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div
                          className="w-2 h-2 rounded-full border border-slate-600 dark:border-slate-400 flex-shrink-0"
                          style={{ backgroundColor: nodeColors[link.target.type] }}
                        />
                        <div className="font-medium break-all">{link.target.label.split('\n')[0]}</div>
                      </div>
                      {link.target.namespace && (
                        <div className="text-slate-500 dark:text-slate-400 mb-1">
                          <span className="text-[10px]">ns: </span>
                          {link.target.namespace}
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>{link.count} flows</span>
                        {link.errorCount > 0 && <span className="text-red-600 dark:text-red-400">{link.errorCount} errors</span>}
                      </div>
                      <div className="text-slate-500 dark:text-slate-500 capitalize text-[10px]">{link.eventType}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Incoming Connections */}
          {(() => {
            const incoming = Array.from(links.values()).filter((link) => link.target.id === selectedNode.id);
            return incoming.length > 0 ? (
              <div>
                <div className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1">
                  <span className="text-purple-600 dark:text-purple-400">←</span>
                  Incoming ({incoming.length})
                </div>
                <div className="space-y-2">
                  {incoming.map((link, idx) => (
                    <div key={idx} className="bg-slate-100 dark:bg-slate-700/50 p-2 rounded text-[11px]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div
                          className="w-2 h-2 rounded-full border border-slate-600 dark:border-slate-400 flex-shrink-0"
                          style={{ backgroundColor: nodeColors[link.source.type] }}
                        />
                        <div className="font-medium break-all">{link.source.label.split('\n')[0]}</div>
                      </div>
                      {link.source.namespace && (
                        <div className="text-slate-500 dark:text-slate-400 mb-1">
                          <span className="text-[10px]">ns: </span>
                          {link.source.namespace}
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>{link.count} flows</span>
                        {link.errorCount > 0 && <span className="text-red-600 dark:text-red-400">{link.errorCount} errors</span>}
                      </div>
                      <div className="text-slate-500 dark:text-slate-500 capitalize text-[10px]">{link.eventType}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

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
                  <input type="checkbox" checked={selectedNamespaces.has(ns)} onChange={() => {}} className="cursor-pointer" />
                  <span>{ns}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
