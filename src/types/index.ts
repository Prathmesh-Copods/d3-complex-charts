// Treemap data types
export interface TreemapNode {
    name: string;
    children?: TreemapNode[];
    value?: number;
    color?: string;
}

export interface TreemapHierarchyNode extends d3.HierarchyNode<TreemapNode> {
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
}

// Packed Circles data types
export interface CircleNode {
    name: string;
    children?: CircleNode[];
    value?: number;
}

// Network Graph data types
export interface NetworkNode {
    id: string;
    group: number;
}

export interface NetworkLink {
    source: string;
    target: string;
    value: number;
}

export interface NetworkData {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

// Geographic Map data types
export interface GeoFeatureProperties {
    name: string;
    value: number;
}