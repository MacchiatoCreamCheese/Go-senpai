import { Link } from "react-router-dom";

import { useToast } from "../components/NotificationToast";

export default function Home() {
  const toast = useToast();

  return (
    <div className="home-stub">
      <div className="home-mark" aria-hidden="true">先</div>
      <h1>Welcome back.</h1>
      <p className="home-tagline">
        Your coaching dashboard will live here once the agentic loop is wired up.
      </p>

      <div className="home-cta-row">
        <Link to="/lobby" className="btn btn-primary">Find a game</Link>
        <Link to="/coach" className="btn btn-ghost">Open Coach</Link>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            toast.push({
              kind: "success",
              title: "Toast system online",
              body: "Async events will surface here once wired.",
            })
          }
        >
          Test toast
        </button>
      </div>
    </div>
  );
}
