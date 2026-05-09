import { getConcept } from "../api";
import type { ConceptDetail } from "../types/concept";
import { getEnrichment } from "../data/mockConceptDetails";

function deriveDifficulty(tags: string[]): ConceptDetail["difficulty"] {
  if (tags.some(t => ["ko", "reading", "strategy", "endgame", "positional", "sabaki"].includes(t)))
    return "Advanced";
  if (tags.some(t => ["life", "fundamentals", "basic", "two_eye"].includes(t)))
    return "Beginner";
  return "Intermediate";
}

function estimateReadingTime(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export async function getConceptDetail(id: string): Promise<ConceptDetail | null> {
  const raw = await getConcept(id);
  if (!raw) return null;

  const enrichment = getEnrichment(id);

  if (enrichment) {
    return {
      id: raw.id,
      title: raw.title,
      tags: raw.tags,
      difficulty: enrichment.difficulty,
      readingMinutes: enrichment.readingMinutes,
      overview: enrichment.overview,
      sections: enrichment.sections,
      related: enrichment.related,
      senseiQuote: enrichment.senseiQuote,
      proTip: enrichment.proTip,
      prev: enrichment.prev,
      next: enrichment.next,
    };
  }

  // Fallback: build a minimal detail from raw API data only
  return {
    id: raw.id,
    title: raw.title,
    tags: raw.tags,
    difficulty: deriveDifficulty(raw.tags),
    readingMinutes: estimateReadingTime(raw.body_md),
    overview: raw.body_md.trim().split(/\n{2,}/)[0] ?? "",
    sections: [
      {
        id: "body",
        kind: "strategic",
        heading: "Overview",
        body: raw.body_md,
      },
    ],
    related: [],
  };
}
