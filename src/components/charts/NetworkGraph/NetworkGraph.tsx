import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { NetworkData, NetworkNode } from '../../../types';
import './NetworkGraph.scss';

// Extended node type that combines D3's SimulationNodeDatum with our NetworkNode
interface SimulationNetworkNode extends d3.SimulationNodeDatum, NetworkNode {}

// Extended link type for the simulation
interface SimulationLink extends d3.SimulationLinkDatum<SimulationNetworkNode> {
  source: string | SimulationNetworkNode;
  target: string | SimulationNetworkNode;
  value: number;
}

const NetworkGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<NetworkData | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/data/networkGraph.json');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const jsonData = await response.json();
        
        // Validate data - ensure all links reference valid nodes
        const nodeIds = new Set(jsonData.nodes.map((node: NetworkNode) => node.id));
        const invalidLinks = jsonData.links.filter(
          (link: { source: string; target: string }) => 
            !nodeIds.has(link.source) || !nodeIds.has(link.target)
        );
        
        if (invalidLinks.length > 0) {
          console.warn('Found invalid links referencing non-existent nodes:', invalidLinks);
          // Filter out invalid links
          jsonData.links = jsonData.links.filter(
            (link: { source: string; target: string }) => 
              nodeIds.has(link.source) && nodeIds.has(link.target)
          );
        }
        
        setData(jsonData);
        setIsLoading(false);
      } catch (err) {
        setError('Error loading network graph data');
        setIsLoading(false);
        console.error(err);
      }
    };

    fetchData();
  }, []);

  // Set up resize handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || 800;
        setDimensions({
          width: containerWidth,
          height: Math.min(containerWidth * 0.75, 600) // Maintain aspect ratio
        });
      }
    };

    // Initial sizing
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Handle zoom in button click
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    
    const newZoomLevel = Math.min(zoomLevel + 0.2, 3); // Limit max zoom to 3x
    setZoomLevel(newZoomLevel);
    
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleTo, newZoomLevel);
  };

  // Handle zoom out button click
  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    
    const newZoomLevel = Math.max(zoomLevel - 0.2, 0.5); // Limit min zoom to 0.5x
    setZoomLevel(newZoomLevel);
    
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleTo, newZoomLevel);
  };

  // Handle zoom reset button click
  const handleZoomReset = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    
    setZoomLevel(1);
    
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  // Create and update visualization
  useEffect(() => {
    if (!data || !svgRef.current || isLoading) return;

    try {
      // Clear any existing visualization
      d3.select(svgRef.current).selectAll('*').remove();

      // Create the SVG element
      const svg = d3.select(svgRef.current)
        .attr('width', dimensions.width)
        .attr('height', dimensions.height)
        .attr('viewBox', [0, 0, dimensions.width, dimensions.height])
        .style('font', '10px sans-serif');
      
      // Create a container group that will be transformed during zoom
      const g = svg.append('g')
        .attr('class', 'zoom-container');

      // Add background (useful for debugging and interaction)
      g.append('rect')
        .attr('width', dimensions.width)
        .attr('height', dimensions.height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all');

      // Create tooltip
      const tooltip = d3.select(tooltipRef.current);

      // Node settings
      const nodeRadius = 15;
      const nodeStrokeWidth = 1.5;

      // Create a nodeMap for direct lookups
      const nodeMap = new Map<string, SimulationNetworkNode>();
      
      // Prepare data for simulation
      const simulationNodes = data.nodes.map(node => {
        const simNode = {
          ...node,
          // Initialize with positions in the center
          x: dimensions.width / 2 + (Math.random() - 0.5) * 100,
          y: dimensions.height / 2 + (Math.random() - 0.5) * 100,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null
        } as SimulationNetworkNode;
        
        // Store in the lookup map
        nodeMap.set(node.id, simNode);
        return simNode;
      });

      // Create links with direct object references
      const simulationLinks = data.links.map(link => {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);
        
        if (!sourceNode || !targetNode) {
          console.error(`Missing node for link: ${link.source} -> ${link.target}`);
          return null;
        }
        
        return {
          ...link,
          source: sourceNode,
          target: targetNode,
          value: link.value
        };
      }).filter(link => link !== null) as SimulationLink[];

      // Create a color scale for node groups
      const groupIds = Array.from(new Set(data.nodes.map(node => node.group)));
      const colorScale = d3.scaleOrdinal<number, string>()
        .domain(groupIds)
        .range(d3.schemeCategory10);

      // Create a force simulation
      const simulation = d3.forceSimulation<SimulationNetworkNode>(simulationNodes)
        .force('link', d3.forceLink<SimulationNetworkNode, SimulationLink>(simulationLinks)
          .id(d => d.id)
          .distance(150)) // Distance between nodes
        .force('charge', d3.forceManyBody().strength(-400)) // Repulsion between nodes
        .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
        .force('collision', d3.forceCollide().radius(nodeRadius * 1.5)); // Prevent node overlap

      // Pre-warm the simulation a bit
      for (let i = 0; i < 50; i++) {
        simulation.tick();
      }

      // Create a group for links
      const links = g.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(simulationLinks)
        .join('line')
        .attr('stroke-width', d => Math.sqrt(d.value))
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6);

      // Create a group for nodes
      const nodes = g.append('g')
        .attr('class', 'nodes')
        .selectAll<SVGCircleElement, SimulationNetworkNode>('circle')
        .data(simulationNodes)
        .join('circle')
        .attr('r', nodeRadius)
        .attr('fill', d => colorScale(d.group))
        .attr('stroke', '#fff')
        .attr('stroke-width', nodeStrokeWidth)
        .style('cursor', 'pointer');

      // Add node labels
      const labels = g.append('g')
        .attr('class', 'labels')
        .selectAll('text')
        .data(simulationNodes)
        .join('text')
        .text(d => d.id)
        .attr('font-size', 12)
        .attr('dx', 18)  // Position label to the right of the node
        .attr('dy', 5)   // Center label vertically with the node
        .style('pointer-events', 'none')  // Make labels non-interactive
        .style('fill', 'white')
        .style('font-weight', 'bold')
        .style('text-shadow', '0 0 3px rgba(0, 0, 0, 0.8)');

      // Zoom behavior 
      const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
        // Update current zoom level state
        setZoomLevel(event.transform.k);
      };

      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 3]) // Limit zoom from 0.5x to 3x
        .on('zoom', handleZoom);
      
      // Store zoom behavior in ref for button access
      zoomBehaviorRef.current = zoomBehavior;

      // Apply zoom behavior to SVG
      svg.call(zoomBehavior);

      // Drag behavior for nodes
      const dragBehavior = d3.drag<SVGCircleElement, SimulationNetworkNode>()
        .on('start', (event: d3.D3DragEvent<SVGCircleElement, unknown, SimulationNetworkNode>) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on('drag', (event: d3.D3DragEvent<SVGCircleElement, unknown, SimulationNetworkNode>) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on('end', (event: d3.D3DragEvent<SVGCircleElement, unknown, SimulationNetworkNode>) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        });

      // Apply drag behavior to nodes
      nodes.call(dragBehavior);

      // Calculate node connection counts for tooltip
      const nodeConnectionCounts = new Map<string, number>();
      simulationLinks.forEach(link => {
        const sourceId = (link.source as SimulationNetworkNode).id;
        const targetId = (link.target as SimulationNetworkNode).id;
        
        nodeConnectionCounts.set(sourceId, (nodeConnectionCounts.get(sourceId) || 0) + 1);
        nodeConnectionCounts.set(targetId, (nodeConnectionCounts.get(targetId) || 0) + 1);
      });

      // Add hover events for nodes
      nodes.on('mouseover', (_event, d: SimulationNetworkNode) => {
        // Highlight connected nodes and links
        const connectedNodeIds = new Set<string>();
        connectedNodeIds.add(d.id);
        
        // Find connected links and nodes
        simulationLinks.forEach(link => {
          const sourceId = (link.source as SimulationNetworkNode).id;
          const targetId = (link.target as SimulationNetworkNode).id;
          
          if (sourceId === d.id || targetId === d.id) {
            connectedNodeIds.add(sourceId);
            connectedNodeIds.add(targetId);
          }
        });

        // Dim all nodes and links
        nodes.style('opacity', 0.2);
        links.style('opacity', 0.1);

        // Highlight connected nodes and links
        nodes.filter((node: SimulationNetworkNode) => connectedNodeIds.has(node.id))
          .style('opacity', 1)
          .style('stroke', '#fff')
          .style('stroke-width', 2);

        links.filter((link: SimulationLink) => {
          const sourceId = (link.source as SimulationNetworkNode).id;
          const targetId = (link.target as SimulationNetworkNode).id;
          return sourceId === d.id || targetId === d.id;
        })
        .style('opacity', 1)
        .style('stroke', '#555')
        .style('stroke-width', (d: SimulationLink) => Math.sqrt(d.value) + 1);

        // Show tooltip
        const transform = d3.zoomTransform(svg.node() as Element);
        const nodeX = (d.x || 0) * transform.k + transform.x;
        const nodeY = (d.y || 0) * transform.k + transform.y;
        
        const svgRect = svgRef.current?.getBoundingClientRect();
        const screenX = (svgRect?.left || 0) + nodeX;
        const screenY = (svgRect?.top || 0) + nodeY;
        
        tooltip
          .style('opacity', 1)
          .style('left', `${screenX + 20}px`) 
          .style('top', `${screenY - 20}px`)
          .html(`<strong>${d.id}</strong><br>Group: ${d.group}<br>Connections: ${nodeConnectionCounts.get(d.id) || 0}`);
      })
      .on('mouseout', () => {
        // Reset all nodes and links
        nodes.style('opacity', 1).style('stroke', '#fff').style('stroke-width', nodeStrokeWidth);
        links.style('opacity', 0.6)
          .style('stroke', '#999')
          .style('stroke-width', (d: SimulationLink) => Math.sqrt(d.value));
        
        // Hide tooltip
        tooltip.style('opacity', 0);
      });

      // Add legend for node groups
      const legendPadding = 20;
      const legendWidth = 120;
      const legend = svg.append('g') // Add legend directly to SVG (not the zoom group)
        .attr('class', 'legend')
        .attr('transform', `translate(${dimensions.width - legendWidth - legendPadding}, ${legendPadding})`);

      // Add legend title
      legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text('Groups');

      // Add legend items
      groupIds.forEach((groupId, i) => {
        const legendRow = legend.append('g')
          .attr('transform', `translate(0, ${i * 20 + 20})`);

        legendRow.append('circle')
          .attr('r', 6)
          .attr('cx', 6)
          .attr('cy', 6)
          .attr('fill', colorScale(groupId));

        legendRow.append('text')
          .attr('x', 20)
          .attr('y', 9)
          .attr('font-size', 10)
          .attr('fill', 'white')
          .text(`Group ${groupId}`);
      });

      // Update function to position all elements correctly
      const updatePositions = () => {
        // Update nodes
        nodes
          .attr('cx', d => d.x || 0)
          .attr('cy', d => d.y || 0);

        // Update links - using object references directly
        links
          .attr('x1', d => (d.source as SimulationNetworkNode).x || 0)
          .attr('y1', d => (d.source as SimulationNetworkNode).y || 0)
          .attr('x2', d => (d.target as SimulationNetworkNode).x || 0)
          .attr('y2', d => (d.target as SimulationNetworkNode).y || 0);

        // Update labels
        labels
          .attr('x', d => d.x || 0)
          .attr('y', d => d.y || 0);
      };

      // Apply initial positions
      updatePositions();

      // Add tick handler for simulation
      simulation.on('tick', updatePositions);
      
      // Start the simulation with high energy
      simulation.alpha(1).restart();
      
    } catch (err) {
      console.error('Error creating network graph visualization:', err);
      setError(`Failed to render network graph: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

  }, [data, dimensions, isLoading]);

  if (isLoading) {
    return <div className="loading">Loading network graph data...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="network-graph-container">
      <h2>Network Graph</h2>
      <p>This network visualization displays relationships between nodes. Nodes are colored by group, and link thickness represents connection strength.</p>
      <div className="visualization" ref={containerRef}>
        <svg ref={svgRef}></svg>
        <div className="tooltip" ref={tooltipRef}></div>
        
        {/* Zoom Controls */}
        <div className="zoom-controls">
          <button onClick={handleZoomIn} className="zoom-button zoom-in" title="Zoom In">+</button>
          <button onClick={handleZoomReset} className="zoom-button zoom-reset" title="Reset Zoom">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
          </button>
          <button onClick={handleZoomOut} className="zoom-button zoom-out" title="Zoom Out">−</button>
        </div>
      </div>
    </div>
  );
};

export default NetworkGraph;