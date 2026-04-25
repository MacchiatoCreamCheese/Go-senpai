import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import Home from "./routes/Home";
import Lobby from "./routes/Lobby";
import PlayGame from "./routes/PlayGame";
import GameViewer from "./routes/GameViewer";
import Coach from "./routes/Coach";
import Drill from "./routes/Drill";
import Profile from "./routes/Profile";
import Games from "./routes/Games";
import Stub from "./routes/Stub";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="lobby" element={<Lobby />} />
        <Route path="play/:gameId" element={<PlayGame />} />

        <Route path="games" element={<Games />} />
        <Route path="games/:gameId" element={<GameViewer />} />
        <Route path="games/:gameId/review" element={<GameViewer />} />

        <Route path="coach" element={<Coach />} />

        <Route path="drill" element={<Drill />} />
        <Route path="drill/:problemId" element={<Drill />} />

        <Route path="profile" element={<Profile />} />
        <Route path="profile/:userId" element={<Profile />} />

        {/* Concepts library — backend endpoints not yet built. */}
        <Route
          path="concepts"
          element={<Stub mark="智" title="Concepts" blurb="The library lands once the backend exposes /concepts. Concept badges and the next-action 'Learn' card already link here." />}
        />
        <Route
          path="concepts/:conceptId"
          element={<Stub mark="智" title="Concept" blurb="Per-concept lessons need GET /concepts/:id on the backend." />}
        />

        <Route
          path="settings"
          element={<Stub mark="調" title="Settings" blurb="Board theme, sound, notifications. Built in Sub-phase 5." />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
