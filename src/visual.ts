"use strict";

import powerbiVisualsApi from "powerbi-visuals-api";
import powerbi = powerbiVisualsApi;
import PrimitiveValue = powerbi.PrimitiveValue;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import ISelectionManager = powerbi.extensibility.ISelectionManager;

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;


import * as d3Dag from 'd3-dag';
import {
    select as d3Select
}
from "d3-selection";


type Selection<T1, T2 = T1> = d3.Selection<any, T1, any, T2>;


// import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
// import "./../style/visual.less";

// import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
// import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
// import IVisual = powerbi.extensibility.visual.IVisual;

import { VisualFormattingSettingsModel } from "./settings";

interface NodeData {
    id: string,
    parentIds: string[]
};

export class Visual implements IVisual {
    private svg: Selection<any>;
    private host: IVisualHost;
    private nodeContainer: Selection<SVGElement>;
    private edgeContainer: Selection<SVGElement>;
    
    private dagData: NodeData[];
    static Config = {
        margins: {
            top: 25,
            bottom: 40,
            left: 60,
            right: 50
        },
        nodeRadius: 10
    }

    // --- --- --- --- --- --- --- --- --- --- ---
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;

        this.svg = d3Select(options.element)
            .append('svg')
            .classed('SimpleDAG', true);

        this.nodeContainer = this.svg
            .append('g');

        this.edgeContainer = this.svg
            .append('g')
            .classed('edgeContainer', true);

        // define arrow heads
        this.svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 9 + 10)
            .attr('refY', 3)
            .attr('orient', 'auto')
            .append('path')
            .attr('d','M0,0 l0,6 9,-3 -9,-3 z')
            .attr('fill', 'black');
    }

    public update(options: VisualUpdateOptions) {
        this.dagData = this.extractDataPoints(options);
        const stratify = d3Dag.graphStratify();
        const dag = stratify(this.dagData);
        const layout = d3Dag.sugiyama();
        layout(dag);
        // TODO: find a way to directly map the points to an inner frame
        

        let width = options.viewport.width;
        let height = options.viewport.height;

        const layers = dag.nodes();
        const links = dag.links();
        let xMax = 0;
        let yMax = 0;
        let pts: {x: number[][]} = {x:[]}
        for (const { x, y } of layers) {
            if (x > xMax) {
                xMax = x;
            }
            if (y > yMax) {
                yMax = y;
            }
        }

        let margins = Visual.Config.margins;
        this.svg
            .attr('width', width)
            .attr('height', height);

        this.nodeContainer.selectAll('circle')
            .data(dag.nodes())
            .join('circle')
            .attr('cx', (d) => (d.x / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('cy', (d) => (d.y / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('r', Visual.Config.nodeRadius)
            .attr('fill', 'black');

        this.edgeContainer.selectAll('.link')
            .data(links)
            .join('line')
            .attr('class', 'link')
            .attr('x1', (d) => (d.points[0][0] / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('y1', (d) => (d.points[0][1] / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('x2', (d) => (d.points[d.points.length-1][0] / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('y2', (d) => (d.points[d.points.length-1][1] / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('stroke', 'black')
            .attr('marker-end', 'url(#arrowhead)');
    }

    private extractDataPoints(options: VisualUpdateOptions): NodeData[] {
        let table = options.dataViews[0].table;
        let edges = table.rows;

        const graph: Record<string, NodeData> = {};

        // Step 1: Build a list of unique node IDs
        const nodeIDs: string[] = Array.from(new Set(edges.flat().map((nd) => nd.toString())));

        // Step 2: Initialize each node in the graph
        nodeIDs.forEach((id) => {
            graph[id] = { id, parentIds: [] };
        });

        // Step 3: Populate the parents for each node based on the edges
        edges.forEach(([src, tgt]) => {
            graph[tgt.toString()].parentIds.push(src.toString());
        });

        return Object.values(graph);
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property. 
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}