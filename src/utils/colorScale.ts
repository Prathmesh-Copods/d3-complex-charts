import * as d3 from 'd3';

// Generate a color scale for categorical data
export const createCategoricalColorScale = (domain: string[]) => {
  return d3.scaleOrdinal<string>()
    .domain(domain)
    .range(d3.schemeCategory10);
};

// Generate a color scale for sequential data
export const createSequentialColorScale = (domain: [number, number], colorScheme: ReadonlyArray<string> = d3.schemeBlues[9]) => {
  return d3.scaleQuantize<string>()
    .domain(domain)
    .range(colorScheme);
};

// Generate a diverging color scale (for positive/negative values)
export const createDivergingColorScale = (domain: [number, number, number]) => {
  return d3.scaleSequential()
    .domain(domain)
    .interpolator(d3.interpolateRdBu);
};