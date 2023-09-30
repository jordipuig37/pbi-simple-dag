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
import {createTooltipServiceWrapper, ITooltipServiceWrapper} from "powerbi-visuals-utils-tooltiputils";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;



import * as d3Dag from 'd3-dag';
import {
    select as d3Select
}
from "d3-selection";


type Selection<T1, T2 = T1> = d3.Selection<any, T1, any, T2>;


// import powerbi from "powerbi-visuals-api";
// import "./../style/visual.less";

// import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
// import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
// import IVisual = powerbi.extensibility.visual.IVisual;

import { VisualFormattingSettingsModel } from "./settings";

interface NodeData {
    id: string,
    parentIds: string[],
    nodeData: PrimitiveValue,
    selectionId: ISelectionId
};

export class Visual implements IVisual {
    private svg: Selection<any>;
    private host: IVisualHost;
    private nodeContainer: Selection<SVGElement>;
    private edgeContainer: Selection<SVGElement>;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    
    private dagData: NodeData[];
    static Config = {
        margins: {
            top: 25,
            bottom: 40,
            left: 60,
            right: 50
        },
        nodeRadius: 25,
        nodeStrokeWidth: 3,
        edgeWidth: 3,
        arrowheadSize: 15
    }

    // --- --- --- --- --- --- --- --- --- --- ---
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;

        this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);

        this.svg = d3Select(options.element)
            .append('svg')
            .classed('SimpleDAG', true);

        // Note: the order of definition here impacts the final rendering
        this.edgeContainer = this.svg
            .append('g')
            .classed('edgeContainer', true);

        this.nodeContainer = this.svg
            .append('g');

        // define arrow heads
        const arrowheadSize = Visual.Config.arrowheadSize; // Define the size of the arrowhead here.
        this.svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('markerWidth', arrowheadSize)
            .attr('markerHeight', arrowheadSize)
            .attr('refX', arrowheadSize*0.9 + Visual.Config.nodeRadius*0.3)
            .attr('refY', arrowheadSize * 0.3)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', `M0,0 l0,${arrowheadSize * 0.6} ${arrowheadSize * 0.9},-${arrowheadSize * 0.3} -${arrowheadSize + 0.9},-${arrowheadSize * 0.3} z`)
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

        let config = Visual.Config;
        let margins = Visual.Config.margins;
        this.svg
            .attr('width', width)
            .attr('height', height);

        this.edgeContainer.selectAll('.link')
            .data(links)
            .join('line')
            .attr('class', 'link')
            .attr('x1', (d) => (d.points[0][0] / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('y1', (d) => (d.points[0][1] / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('x2', (d) => (d.points[d.points.length-1][0] / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('y2', (d) => (d.points[d.points.length-1][1] / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('stroke', '#999')
            .attr('stroke-width', config.edgeWidth)
            .attr('marker-end', 'url(#arrowhead)');

        const nodeSelection = this.nodeContainer.selectAll('circle')
            .data(dag.nodes())
            .join('circle')
            .attr('cx', (d) => (d.x / xMax) * (width-margins.left-margins.right) + margins.left)
            .attr('cy', (d) => (d.y / yMax) * (height-margins.top-margins.bottom) + margins.top)
            .attr('r', config.nodeRadius)
            .attr('fill', '#0077B6')
            .attr('stroke', '#333')
            .attr('stroke-width', config.nodeStrokeWidth);

        // add tooltips
        this.tooltipServiceWrapper.addTooltip(nodeSelection,
            (datapoint: NodeData) => this.getTooltipData(datapoint),
            (datapoint: NodeData) => datapoint.selectionId
        );
    }

    private extractDataPoints(options: VisualUpdateOptions): NodeData[] {
        let table = options.dataViews[0].table;
        let edges = table.rows;

        const graph: Record<string, NodeData> = {};

        // Step 1: Build a list of unique node IDs
        const uniqueNodesSet: Set<string> = new Set();

        // Loop through the array and add values from both columns to the Set
        for (const [source, target, snd, tnd] of edges) {
            uniqueNodesSet.add(source.toString());
            uniqueNodesSet.add(target.toString());
        }

        // Convert the Set back to an array to get the complete list of nodes
        const nodeIDs = Array.from(uniqueNodesSet);
        // const nodeIDs: string[] = Array.from(new Set(edges.map((row) => row[0].toString())));

        // Step 2: Initialize each node in the graph
        nodeIDs.forEach((id) => {
            const selectionId: ISelectionId = this.host.createSelectionIdBuilder()
                .createSelectionId();
            graph[id] = { id, parentIds: [], nodeData: "", selectionId: selectionId };
        });

        // Step 3: Populate the parents for each node based on the edges
        edges.forEach(([src, tgt, srcData, tgtData]) => {
            graph[tgt.toString()].parentIds.push(src.toString());
            graph[src.toString()].nodeData = srcData;
            graph[tgt.toString()].nodeData = tgtData;
        });

        return Object.values(graph);
    }

    private getTooltipData(value: any): VisualTooltipDataItem[] {
        return [{
                displayName: "Node data",
                value: value.data.nodeData,
                header: value.data.id.toString()
            },
            {
                displayName: "New variable",
                value: "dummy value"
            }
        ];
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property. 
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}