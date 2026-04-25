import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import Home from "./routes/Home";
import Lobby from "./routes/Lobby";
import PlayGame from "./routes/PlayGame";
import GameViewer from "./routes/GameViewer";
import Stub from "./routes/Stub";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="lobby" element={<Lobby />} />
        <Route path="play/:gameId" element={<PlayGame />} />

        {/* Stubs — built in later sub-phases. */}
        <Route
          path="games"
          element={<Stub mark="史" title="Game history" blurb="A filterable list of every game you've played. Built in Sub-phase 4." />}
        />
        <Route path="games/:gameId" element={<GameViewer />} />
        <Route path="games/:gameId/review" element={<GameViewer />} />
        <Route
          path="coach"
          element={<Stub mark="師" title="Coach" blurb="Your agentic coaching session: what to do next, and why. Built in Sub-phase 4." />}
        />
        <Route
          path="drill"
          element={<Stub mark="練" title="Drill" blurb="Personalised tsumego targeting your weakest themes. Built in Sub-phase 4." />}
        />
        <Route path="drill/:problemId" element={<Stub mark="練" title="Drill" />} />
        <Route
          path="profile"
          element={<Stub mark="己" title="Profile" blurb="Weaknesses, history, progress. Built in Sub-phase 4." />}
        />
        <Route path="profile/:userId" element={<Stub mark="己" title="Profile" />} />
        <Route
          path="concepts"
          element={<Stub mark="智" title="Concepts" blurb="The library of Go ideas your coach can teach. Built in Sub-phase 4." />}
        />
        <Route path="concepts/:conceptId" element={<Stub mark="智" title="Concept" />} />
        <Route
          path="settings"
          element={<Stub mark="調" title="Settings" blurb="Board theme, sound, notifications. Built in Sub-phase 5." />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
