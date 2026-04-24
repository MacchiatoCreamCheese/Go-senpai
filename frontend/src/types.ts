export type ColorCode = "B" | "W";
export type Status = "active" | "finished" | "resigned";
export type MoveKind = "play" | "pass" | "resign";

export interface PointT {
  row: number;
  col: number;
}

export interface MoveT {
  color: ColorCode;
  kind: MoveKind;
  point: PointT | null;
}

export interface GameStateT {
  board: number[][]; // 0 empty, 1 black, 2 white
  turn: ColorCode;
  captures: Record<ColorCode, number>;
  moves: MoveT[];
  status: Status;
  result: string | null;
}

export type OpponentType = "human" | "ai";

export interface GameT {
  id: string;
  size: number;
  komi: number;
  black_user_id: string | null;
  white_user_id: string | null;
  opponent_type: OpponentType;
  ai_rank: number | null;
  state: GameStateT;
}
