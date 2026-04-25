declare module "@sabaki/shudan" {
  import { ComponentType, CSSProperties } from "react";

  /** Marker that can be rendered on a vertex; see shudan's Vertex.js. */
  export interface VertexMarker {
    type: "circle" | "cross" | "triangle" | "square" | "point" | "loader" | "label";
    label?: string;
    zIndex?: number;
  }

  export interface GhostStone {
    sign: 1 | -1;
    type?: "good" | "interesting" | "doubtful" | "bad";
    faint?: boolean;
  }

  export interface GobanProps {
    vertexSize?: number;
    signMap: number[][];
    /** Per-vertex markers (last-move dot, top-move circle, etc.). */
    markerMap?: (VertexMarker | null)[][];
    /** Per-vertex translucent ghost stones (variations / engine suggestions). */
    ghostStoneMap?: (GhostStone | null)[][];
    /** 0..1 heat overlay; we use it for ownership-style fills if available. */
    heatMap?: ({ strength: number; text?: string } | null)[][];
    paintMap?: number[][];
    showCoordinates?: boolean;
    busy?: boolean;
    fuzzyStonePlacement?: boolean;
    animateStonePlacement?: boolean;
    animationDuration?: number;
    selectedVertices?: Array<[number, number]>;
    dimmedVertices?: Array<[number, number]>;
    style?: CSSProperties;
    className?: string;
    onVertexClick?: (evt: unknown, vertex: [number, number]) => void;
  }

  export const Goban: ComponentType<GobanProps>;
}
