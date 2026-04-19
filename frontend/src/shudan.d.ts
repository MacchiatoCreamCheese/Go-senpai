declare module "@sabaki/shudan" {
  import { ComponentType } from "react";

  export interface GobanProps {
    vertexSize?: number;
    signMap: number[][];
    showCoordinates?: boolean;
    busy?: boolean;
    onVertexClick?: (evt: unknown, vertex: [number, number]) => void;
  }

  export const Goban: ComponentType<GobanProps>;
}
