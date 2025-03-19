import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TreemapNode, TreemapHierarchyNode } from '../../../types';
import { createCategoricalColorScale } from '../../../utils/colorScale';
import './Treemap.scss';

const Treemap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TreemapNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/data/treemap.json');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const jsonData = await response.json();
        setData(jsonData);
        setIsLoading(false);
      } catch (err) {
        setError('Error loading treemap data');
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

  // Create and update visualization
  useEffect(() => {
    if (!data || !svgRef.current || isLoading) return;

    // Clear any existing visualization
    d3.select(svgRef.current).selectAll('*').remove();

    // Constants for layout
    const legendWidth = 120;
    const legendPadding = 10;
    const mainWidth = dimensions.width - legendWidth;
    
    // Create the treemap layout
    const root = d3.hierarchy(data)
      .sum(d => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) as TreemapHierarchyNode;

    // Get all unique category names for color scale
    const categories = root.children?.map(d => d.data.name) || [];
    const colorScale = createCategoricalColorScale(categories);

    // Create the treemap generator with additional vertical padding to make room for category labels
    const verticalCategoryPadding = 30; // Space for category labels
    const treemap = d3.treemap<TreemapNode>()
      .size([mainWidth, dimensions.height - verticalCategoryPadding]) // Adjusted height
      .paddingOuter(4)
      .paddingTop(28) // Padding at top for parent labels
      .paddingInner(2)
      .round(true);

    // Apply the treemap layout
    treemap(root);

    // Create the SVG element
    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('viewBox', [0, 0, dimensions.width, dimensions.height])
      .style('font', '10px sans-serif');

    // Add a background for the entire visualization for debugging
    svg.append("rect")
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.1)");

    // Create a container for the treemap that is offset to make room for category labels
    const treemapContainer = svg.append("g")
      .attr("class", "treemap-container");

    // Create a background for labels to improve readability
    const labelBackground = svg.append("g")
      .attr("class", "label-backgrounds");

    // Create tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Define mouse event handlers
    const mouseover = function(this: SVGElement) {
      tooltip.style('opacity', 1);
      d3.select(this)
        .style('stroke', '#000')
        .style('stroke-width', 2)
        .style('opacity', 0.8);
    };

    const mousemove = function(event: MouseEvent, d: TreemapHierarchyNode) {
      const formatValue = d3.format(",d");
      const name = d.data.name;
      const value = d.value ? formatValue(d.value) : "N/A";
      const path = d.ancestors()
        .reverse()
        .map(d => d.data.name)
        .join(" > ");

      // Get the position of the visualization container
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      // Calculate tooltip position relative to the container
      const tooltipX = event.clientX - (containerRect?.left || 0) + 10;
      const tooltipY = event.clientY - (containerRect?.top || 0) - 28;
      
      tooltip
        .html(`<strong>${name}</strong><br>Value: ${value}<br>${path}`)
        .style('left', `${tooltipX}px`)
        .style('top', `${tooltipY}px`);
    };

    const mouseleave = function(this: SVGElement) {
      tooltip.style('opacity', 0);
      d3.select(this)
        .style('stroke', null)
        .style('opacity', 1);
    };

    // Create leaf nodes
    const leaf = treemapContainer.selectAll(".leaf-node")
      .data(root.leaves())
      .join("g")
      .attr("class", "leaf-node")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    // Add rectangles to leaf nodes
    leaf.append("rect")
      .attr("id", (_, i) => `rect-${i}`)
      .attr("width", d => Math.max(0, d.x1! - d.x0! - 1))
      .attr("height", d => Math.max(0, d.y1! - d.y0! - 1))
      .attr("fill", d => {
        // Find the parent category and use color scale
        const parentCategory = d.ancestors().find(node => node.depth === 1);
        return parentCategory ? colorScale(parentCategory.data.name) : "#ccc";
      })
      .style("opacity", 0.8)
      .on("mouseover", mouseover)
      .on("mousemove", mousemove)
      .on("mouseleave", mouseleave);

    // Add text labels to leaf nodes
    leaf.append("text")
      .attr("clip-path", (_, i) => `url(#clip-${i})`)
      .selectAll("tspan")
      .data(d => {
        const name = d.data.name;
        // Only add text if there is enough space
        if (d.x1! - d.x0! < 30 || d.y1! - d.y0! < 20) {
          return [];
        }
        return name.length <= 15 
          ? [name] 
          : [name.substring(0, 14) + "..."];
      })
      .join("tspan")
      .attr("x", 3)
      .attr("y", (_, i, nodes) => {
        const isLastNode = i === (nodes.length - 1) ? 1 : 0;
        return `${isLastNode * 0.3 + 1.1 + i * 0.9}em`;
      })
      .attr("fill", "white")
      .attr("font-size", "0.8em")
      .text(d => d);

    // Add title to help with accessibility
    leaf.append("title")
      .text(d => {
        const ancestors = d.ancestors()
          .map(d => d.data.name)
          .reverse()
          .join(" > ");
        return `${ancestors}\nValue: ${d3.format(",d")(d.value!)}`;
      });

    // Add clip paths for text
    leaf.append("clipPath")
      .attr("id", (_, i) => `clip-${i}`)
      .append("use")
      .attr("xlink:href", (_, i) => `#rect-${i}`);

    // Determine top-level sections
    const sections = root.children || [];

    // Add background for ALL parent labels for better readability
    sections.forEach(section => {
      // Create label background for section
      labelBackground.append("rect")
        .attr("x", section.x0!)
        .attr("y", section.y0! - 24)
        .attr("width", section.x1! - section.x0!)
        .attr("height", 20)
        .attr("fill", "rgba(0,0,0,0.6)")
        .attr("rx", 3);
    });

    // Add parent labels (categories)
    svg.selectAll(".parent-label")
      .data(sections)
      .join("text")
      .attr("class", "parent-label")
      .attr("x", d => (d.x0! + d.x1!) / 2)
      .attr("y", d => d.y0! - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", "1em")
      .attr("font-weight", "bold")
      .attr("fill", "white")
      .text(d => d.data.name);

    // Add legend to the right side of the treemap
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${mainWidth + legendPadding}, 10)`);
    
    // Add legend title
    legend.append("text")
      .attr("x", 0)
      .attr("y", 0)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "white")
      .text("Categories");
    
    // Legend boxes
    if (root.children) {
      root.children.forEach((category, i) => {
        const legendRow = legend.append("g")
          .attr("transform", `translate(0, ${i * 20 + 20})`);
        
        legendRow.append("rect")
          .attr("width", 15)
          .attr("height", 15)
          .attr("fill", colorScale(category.data.name));
          
        legendRow.append("text")
          .attr("x", 20)
          .attr("y", 12)
          .attr("fill", "white")
          .text(category.data.name);
      });
    }

  }, [data, dimensions, isLoading]);

  if (isLoading) {
    return <div className="loading">Loading treemap data...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="treemap-container">
      <h2>Hierarchical Treemap</h2>
      <p>This treemap shows hierarchical data with nested categories and their relative sizes.</p>
      <div className="visualization" ref={containerRef}>
        <svg ref={svgRef}></svg>
        <div className="tooltip" ref={tooltipRef}></div>
      </div>
    </div>
  );
};

export default Treemap;