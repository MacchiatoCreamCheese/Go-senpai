import { useNavigate, useParams } from "react-router-dom";

import { GameView } from "../GameView";

export default function PlayGame() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  if (!gameId) {
    navigate("/lobby", { replace: true });
    return null;
  }
  return (
    <GameView
      gameId={gameId}
      onExit={() => navigate("/lobby")}
      onPlayAgain={(id) => navigate(`/play/${id}`)}
      onOpenReview={(id) => navigate(`/games/${id}`)}
    />
  );
}
