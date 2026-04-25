import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getConcept } from "../api";
import { renderMarkdown } from "../lib/markdown";

export default function ConceptDetail() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const concept = useQuery({
    queryKey: ["concept", conceptId],
    queryFn: () => (conceptId ? getConcept(conceptId) : Promise.resolve(null)),
    enabled: !!conceptId,
  });

  if (concept.isLoading) {
    return <div className="stub-page"><p>Loading…</p></div>;
  }

  if (!concept.data) {
    return (
      <div className="stub-page">
        <div className="stub-mark">智</div>
        <h1>Concept not found</h1>
        <p>This concept hasn't been seeded into the corpus yet.</p>
        <Link to="/concepts" className="btn btn-primary">Back to library</Link>
      </div>
    );
  }

  const c = concept.data;
  return (
    <div className="concept-detail-page">
      <header className="concept-detail-head">
        <Link to="/concepts" className="link-btn">← Library</Link>
        <h1 className="concept-detail-title">{c.title}</h1>
        {c.tags.length > 0 && (
          <div className="concept-detail-tags">
            {c.tags.map((t) => <span key={t} className="concept-tag-chip">{t}</span>)}
          </div>
        )}
      </header>
      <article
        className="concept-detail-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body_md) }}
      />
    </div>
  );
}
