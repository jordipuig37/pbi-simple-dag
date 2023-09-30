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
    }

    public update(options: VisualUpdateOptions) {
        this.dagData = this.extractDataPoints(options);
        const stratify = d3Dag.graphStratify();
        const dag = stratify(this.dagData);
        const layout = d3Dag.sugiyama();
        layout(dag);
        

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

        // for (const { points } of links) {
        //     pts.x.push(points[0]);   
        //     pts.x.push(points[1]);   
        // }

        this.svg
            .attr('width', width)
            .attr('height', height);
            // .append('text')
            // .text(JSON.stringify(pts))
            // .attr('x', 20)
            // .attr('y', 100);

        this.nodeContainer.selectAll('circle')
            .data(dag.nodes())
            .join('circle')
            .attr('cx', (d) => (d.x / xMax) * width)
            .attr('cy', (d) => (d.y / yMax) * height)
            .attr('r', 10)
            .attr('fill', 'black');
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