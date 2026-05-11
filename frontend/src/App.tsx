import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import { RequireAuth } from "./layout/RequireAuth";
import Home from "./routes/Home";
import Lobby from "./routes/Lobby";
import Login from "./routes/Login";
import PlayGame from "./routes/PlayGame";
import GameViewer from "./routes/GameViewer";
import Review from "./routes/Review";
import Coach from "./routes/Coach";
import Drill from "./routes/Drill";
import DrillHub from "./routes/DrillHub";
import DrillSessionRoute from "./routes/DrillSession";
import Profile from "./routes/Profile";
import Games from "./routes/Games";
import Settings from "./routes/Settings";
import Concepts from "./routes/Concepts";
import ConceptDetail from "./routes/ConceptDetail";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
        <Route path="play/:gameId" element={<RequireAuth><PlayGame /></RequireAuth>} />

        <Route path="games" element={<Games />} />
        <Route path="games/:gameId" element={<GameViewer />} />
        <Route path="games/:gameId/review" element={<Review />} />

        <Route path="coach" element={<RequireAuth><Coach /></RequireAuth>} />

        <Route path="drill" element={<RequireAuth><DrillHub /></RequireAuth>} />
        <Route path="drill/session/:sessionId" element={<RequireAuth><DrillSessionRoute /></RequireAuth>} />
        <Route path="drill/:problemId" element={<RequireAuth><Drill /></RequireAuth>} />

        <Route path="profile"           element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="profile/history"   element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="profile/concepts"  element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="profile/analytics" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="profile/:userId"   element={<Profile />} />

        <Route path="concepts" element={<Concepts />} />
        <Route path="concepts/:conceptId" element={<ConceptDetail />} />

        <Route path="settings" element={<Settings />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
