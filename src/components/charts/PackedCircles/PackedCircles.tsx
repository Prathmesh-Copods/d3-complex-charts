import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CircleNode } from '../../../types';
import { createCategoricalColorScale } from '../../../utils/colorScale';
import './PackedCircles.scss';

// Use a type alias instead of an empty interface
type CircleHierarchyNode = d3.HierarchyCircularNode<CircleNode>;

const PackedCircles: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [data, setData] = useState<CircleNode | null>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const response = await fetch('/data/packedCircles.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch data');
                }
                const jsonData = await response.json();
                setData(jsonData);
                setIsLoading(false);
            } catch (err) {
                setError('Error loading packed circles data');
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
                    height: Math.min(containerWidth, 600) // Make it more square for circles
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

        // Create the circle packing layout
        const root = d3.hierarchy(data)
            .sum(d => d.value ?? 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) as CircleHierarchyNode;

        // Get all unique category names for color scale
        // We'll use the depth=1 nodes as our main categories
        const categories = root.children?.map(d => d.data.name) || [];
        const colorScale = createCategoricalColorScale(categories);

        // Create the pack layout generator
        const pack = d3.pack<CircleNode>()
            .size([dimensions.width, dimensions.height])
            .padding(3);

        // Apply the pack layout
        pack(root);

        // Create the SVG element
        const svg = d3.select(svgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .attr('viewBox', [0, 0, dimensions.width, dimensions.height])
            .style('font', '10px sans-serif')
            .style('cursor', 'pointer');

        // Create tooltip
        const tooltip = d3.select(tooltipRef.current);

        // Using arrow functions to avoid 'this' context issues
        const mouseover = (event: MouseEvent, d: CircleHierarchyNode) => {
            tooltip.style('opacity', 1);

            // Highlight the current circle and its ancestors
            svg.selectAll('circle')
                .style('stroke-opacity', 0.2)
                .style('fill-opacity', 0.2);

            // Use d3.select(event.currentTarget) instead of this
            d3.select(event.currentTarget as Element)
                .style('stroke-opacity', 1)
                .style('fill-opacity', 0.8)
                .style('stroke-width', 2);

            // Also highlight ancestors
            let current = d;
            while (current.parent) {
                svg.select(`circle[data-id="${current.data.name}"]`)
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', 0.8);
                current = current.parent;
            }
        };

        const mousemove = (event: MouseEvent, d: CircleHierarchyNode) => {
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

        const mouseleave = () => {
            tooltip.style('opacity', 0);

            // Reset all circles
            svg.selectAll('circle')
                .style('stroke-opacity', 1)
                .style('stroke-width', 1)
                // Use the data parameter passed to the callback instead of accessing it through this
                .style('fill-opacity', function () {
                    // Use d3.select(this).datum() to get the properly typed data
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const d = d3.select(this).datum() as any;
                    return d.children ? 0.3 : 0.8;
                });
        };

        // Helper for color
        const colorOf = (d: CircleHierarchyNode) => {
            // If this is a leaf node, use its parent's color
            if (!d.children) {
                const parent = d.ancestors().find(node => node.depth === 1);
                return parent ? colorScale(parent.data.name) : "#ccc";
            }

            // If it's a category node (depth=1), use the color scale
            if (d.depth === 1) {
                return colorScale(d.data.name);
            }

            // For the root node or other nodes, use gray
            return "#ccc";
        };

        // Create the visualization - we'll use a different approach than the treemap
        // by creating one group for all circles
        svg.append("g")
            .selectAll("circle")
            .data(root.descendants())
            .join("circle")
            .attr("data-id", d => d.data.name)
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .attr("r", d => d.r)
            .style("fill", d => colorOf(d))
            .style("fill-opacity", d => d.children ? 0.3 : 0.8)
            .style("stroke", "#fff")
            .style("stroke-width", 1)
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseleave", mouseleave);

        // First, create a specific group for parent node labels (categories)
        svg.append("g")
            .attr("class", "parent-labels")
            .selectAll("text")
            .data(root.descendants().filter(d => d.depth === 1)) // Only depth 1 nodes (main categories)
            .join("text")
            .attr("transform", d => `translate(${d.x},${d.y - d.r + 24})`) // Position at top of circle
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("fill", "white")
            .attr("font-size", "18px")
            .attr("font-weight", "bold")
            .style("text-shadow", "0 0 3px rgba(0, 0, 0, 0.8)")
            .text(d => d.data.name);

        // Then create a group for leaf node labels and smaller parent nodes
        svg.append("g")
            .attr("class", "leaf-labels")
            .style("font", "10px sans-serif")
            .style("pointer-events", "none")
            .style("text-anchor", "middle")
            .selectAll("text")
            .data(root.descendants().filter(d => !d.children || d.depth > 1)) // Leaf nodes or deeper parent nodes
            .filter(d => d.r > 20) // Only add labels to circles large enough to display text
            .join("text")
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .attr("dy", "0.35em")
            .attr("fill", "white")
            .style("font-size", d => Math.min(d.r / 3, 14) + "px")
            .style("text-shadow", "0 0 3px rgba(0, 0, 0, 0.8)")
            .text(d => d.data.name);

        // Add a legend on the right side
        const legendWidth = 120;
        const legendPadding = 10;

        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${dimensions.width - legendWidth - legendPadding}, 10)`);

        // Add legend title
        legend.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .attr("fill", "white")
            .text("Categories");

        // Legend circles and labels
        if (root.children) {
            root.children.forEach((category, i) => {
                const legendRow = legend.append("g")
                    .attr("transform", `translate(0, ${i * 20 + 20})`);

                // Use circles instead of rectangles for this legend
                legendRow.append("circle")
                    .attr("cx", 7.5)
                    .attr("cy", 7.5)
                    .attr("r", 7.5)
                    .attr("fill", colorScale(category.data.name));

                legendRow.append("text")
                    .attr("x", 20)
                    .attr("y", 12)
                    .attr("fill", "white")
                    .text(category.data.name);
            });
        }

        // For accessibility
        svg.append("title")
            .text("Packed Circles Visualization");

    }, [data, dimensions, isLoading]);

    if (isLoading) {
        return <div className="loading">Loading packed circles data...</div>;
    }

    if (error) {
        return <div className="error">{error}</div>;
    }

    return (
        <div className="packed-circles-container">
            <h2>Packed Circles</h2>
            <p>This visualization shows hierarchical data using nested circles where circle size represents the value.</p>
            <div className="visualization" ref={containerRef}>
                <svg ref={svgRef}></svg>
                <div className="tooltip" ref={tooltipRef}></div>
            </div>
        </div>
    );
};

export default PackedCircles;