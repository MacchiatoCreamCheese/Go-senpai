import type { ConceptSection, RelatedConceptRef, SenseiQuote, ConceptNavLink, ConceptDifficulty } from "../types/concept";

export interface ConceptEnrichment {
  difficulty: ConceptDifficulty;
  readingMinutes: number;
  overview: string;
  sections: ConceptSection[];
  related: RelatedConceptRef[];
  senseiQuote?: SenseiQuote;
  proTip?: string;
  prev?: ConceptNavLink;
  next?: ConceptNavLink;
}

export const CONCEPT_ENRICHMENTS: Record<string, ConceptEnrichment> = {
  ladder: {
    difficulty: "Intermediate",
    readingMinutes: 4,
    overview:
      "The ladder (ダメヅマリ) is one of the most fundamental capturing techniques in Go. A stone is chased across the board in a zigzag pattern until it runs into the edge — or into a friendly stone that rescues it.",
    sections: [
      {
        id: "mechanics",
        kind: "mechanics",
        heading: "How a Ladder Works",
        body: "A ladder begins when a stone is atari and has only one escape direction. Each escape attempt is immediately cut off by the pursuer, forcing the fleeing stone diagonally toward the edge.",
        steps: [
          { step: 1, text: "Identify the target stone in atari with only one liberty." },
          { step: 2, text: "Place your stone to cut off the only escape direction." },
          { step: 3, text: "Each time the opponent extends, block the new lead stone." },
          { step: 4, text: "Repeat diagonally until the chain reaches the edge." },
          { step: 5, text: "The chain is captured when it has no more liberties at the wall." },
        ],
      },
      {
        id: "strategic",
        kind: "strategic",
        heading: "Strategic Importance",
        body:
          "Ladders fundamentally reshape the strategic value of the entire board. A stone placed in the ladder's path — a *ladder breaker* — can turn a losing ladder into a rescue. Professionals spend several moves confirming or denying ladder breakers before initiating one. Missing a ladder breaker is one of the most common beginner mistakes.",
      },
      {
        id: "examples",
        kind: "examples",
        heading: "Practical Examples",
        body:
          "**Ladder breaker at D10:** If Black plays a stone on the diagonal path before the chase begins, the ladder fails and White escapes with a large connected group. Always count the ladder path before playing.\n\n**Edge proximity:** Ladders started near the edge complete quickly; ladders started near the center cross the entire board. Be wary of initiating a long ladder that passes through contested territory.",
      },
      {
        id: "common_mistakes",
        kind: "common_mistakes",
        heading: "Common Mistakes",
        body:
          "**Not checking for ladder breakers:** Always trace the full diagonal path before starting a ladder. One enemy stone anywhere on that line breaks it.\n\n**Ignoring your own ladder breakers:** Sometimes you can play a stone that simultaneously threatens the opponent and breaks their ladder — this dual-purpose move is very powerful.\n\n**Ladder vs. net confusion:** If the ladder fails, consider switching to a net (geta) instead. A net doesn't require direct pursuit and is immune to breakers.",
      },
    ],
    related: [
      { id: "net", title: "Net (Geta)", tags: ["tactics", "capture"], relation: "Alternative when ladder fails" },
      { id: "snapback", title: "Snapback", tags: ["tactics", "tesuji"], relation: "Related capturing tesuji" },
      { id: "liberty_count", title: "Liberty Count", tags: ["fundamentals"], relation: "Foundation for ladder reading" },
    ],
    senseiQuote: {
      text: "If you don't read the ladder, you don't play Go.",
      attribution: "Go proverb",
    },
    proTip: "Before playing any ladder, mentally trace every diagonal step to the edge. One missed breaker and the tables turn completely.",
    prev: { id: "atari", title: "Atari" },
    next: { id: "net", title: "Net (Geta)" },
  },

  net: {
    difficulty: "Intermediate",
    readingMinutes: 3,
    overview:
      "The net (geta, 下駄) is a capturing technique that surrounds a stone's escape routes without directly chasing it. Unlike the ladder, a net is not disrupted by stones on the diagonal — making it a reliable alternative when ladders fail.",
    sections: [
      {
        id: "mechanics",
        kind: "mechanics",
        heading: "How a Net Works",
        body: "A net seals off all possible escape liberties from a distance, leaving the target stone with no path to connect or expand.",
        steps: [
          { step: 1, text: "Identify the target stone and count its escape routes." },
          { step: 2, text: "Find the knight's-move (keima) placement that covers the most exits." },
          { step: 3, text: "Play the net stone — it need not be adjacent to the target." },
          { step: 4, text: "If the opponent tries to run, your net stone already covers the path." },
          { step: 5, text: "Maintain the enclosure and capture when liberties run out." },
        ],
      },
      {
        id: "strategic",
        kind: "strategic",
        heading: "Strategic Importance",
        body:
          "Nets excel on the open board where ladders would travel dangerously through contested areas. Because the net stone is not adjacent to the target, it can serve a dual purpose — also claiming territory or building shape elsewhere. Recognizing when to switch from a ladder to a net is a mark of intermediate strength.",
      },
      {
        id: "examples",
        kind: "examples",
        heading: "Practical Examples",
        body:
          "**Knight's-move net:** The most common pattern. Play one knight's move ahead of the fleeing stone. It cannot bypass your stone without entering atari.\n\n**Large knight's-move net:** On an open board, a large knight's-move (ogeima) can net a faster-moving stone, but requires accurate reading to confirm no escape exists.",
      },
    ],
    related: [
      { id: "ladder", title: "Ladder", tags: ["tactics", "capture"], relation: "Complementary capturing technique" },
      { id: "snapback", title: "Snapback", tags: ["tactics", "tesuji"], relation: "Another capturing tesuji" },
    ],
    senseiQuote: {
      text: "When the ladder fails, look for the net.",
      attribution: "Go proverb",
    },
    proTip: "A net stone placed with a knight's move is often more flexible than a chase — it can pull double duty as a territory move.",
    prev: { id: "ladder", title: "Ladder" },
    next: { id: "snapback", title: "Snapback" },
  },

  empty_triangle: {
    difficulty: "Beginner",
    readingMinutes: 3,
    overview:
      "The empty triangle (虚三角) is one of Go's most infamous bad shapes. Three stones forming an L with an internal empty intersection waste a liberty and create structural weakness. Recognizing it — and avoiding it — is essential for beginners.",
    sections: [
      {
        id: "mechanics",
        kind: "mechanics",
        heading: "What Makes It Bad",
        body: "An empty triangle occurs when two of your stones are connected to a third stone in an L-shape, leaving the inner corner empty. This is inefficient because that empty corner is a wasted internal liberty.",
        steps: [
          { step: 1, text: "Two stones are adjacent (sharing a side)." },
          { step: 2, text: "A third stone extends from one of them at a right angle." },
          { step: 3, text: "The inner corner of the L is empty — that's the empty triangle." },
          { step: 4, text: "Compare: the same three stones in a straight line cover more ground." },
          { step: 5, text: "Remedy: extend in a straight line or play a diagonal to fill the weakness." },
        ],
      },
      {
        id: "strategic",
        kind: "strategic",
        heading: "When It's Acceptable",
        body:
          "The empty triangle is not always wrong — it's a *shape* heuristic, not an absolute rule. Sometimes connecting with an empty triangle is the fastest way to avoid capture. The proverb specifically warns against playing it unnecessarily. Learning to distinguish forced empty triangles from avoidable ones is the real lesson.",
      },
      {
        id: "examples",
        kind: "examples",
        heading: "Shape Comparisons",
        body:
          "**Bad:** Black plays B4, C4, B3 — classic empty triangle. The point C3 is wasted internally.\n\n**Better:** Black plays B4, C4, C3 instead — the bamboo joint or straight extension covers more territory and has the same stone count.\n\n**Forced:** If the opponent threatens both B3 and C3, playing B3 to connect *is* the empty triangle but is correct — the shape is forced, not voluntary.",
      },
    ],
    related: [
      { id: "bamboo_joint", title: "Bamboo Joint", tags: ["shape"], relation: "Preferred alternative shape" },
      { id: "tiger_mouth", title: "Tiger's Mouth", tags: ["shape"], relation: "Related good shape" },
    ],
    senseiQuote: {
      text: "Don't make an empty triangle.",
      attribution: "Go proverb",
    },
    proTip: "If you find yourself about to play an empty triangle, pause and ask: can I extend in a straight line instead? Usually the answer is yes.",
    prev: { id: "two_eyes", title: "Two Eyes" },
    next: { id: "bamboo_joint", title: "Bamboo Joint" },
  },

  snapback: {
    difficulty: "Intermediate",
    readingMinutes: 3,
    overview:
      "Snapback (ウッテガエシ) is a tesuji where you sacrifice a stone to set up an immediate recapture that your opponent cannot avoid. The key: after the opponent captures, the capturing stone itself falls into atari.",
    sections: [
      {
        id: "mechanics",
        kind: "mechanics",
        heading: "The Snapback Pattern",
        body: "Snapback requires a precise configuration: a group with a specific liberty arrangement where capturing one sacrificed stone creates a new atari.",
        steps: [
          { step: 1, text: "Identify a group where playing a sacrifice stone creates a three-stone L." },
          { step: 2, text: "Play the sacrifice — it is immediately captured by the opponent." },
          { step: 3, text: "After capture, the opponent's capturing stone (and possibly others) are now in atari." },
          { step: 4, text: "Capture back — you gain more stones than you sacrificed." },
          { step: 5, text: "Ko rules do not apply because the board position is different." },
        ],
      },
      {
        id: "strategic",
        kind: "strategic",
        heading: "Strategic Importance",
        body:
          "Snapback is a tesuji — a clever, locally optimal move. It often appears in life-and-death problems and endgame sequences. Because it bypasses ko rules entirely, it can resolve fights that would otherwise drag into complex ko battles. Recognizing the snapshot pattern saves liberties and surprises opponents.",
      },
      {
        id: "examples",
        kind: "examples",
        heading: "Classic Snapback",
        body:
          "**Straight snapback:** Black has a stone at A, White captures at B creating a two-stone chain. Black fills at C — White's chain is now in atari and cannot escape. Black recaptures three stones for one.\n\n**L-shaped snapback:** A subtler version where the setup requires reading two moves deep. Very common in life-and-death.",
      },
    ],
    related: [
      { id: "ladder", title: "Ladder", tags: ["tactics", "capture"], relation: "Complementary capturing technique" },
      { id: "net", title: "Net (Geta)", tags: ["tactics", "capture"], relation: "Another tactical capture" },
      { id: "ko", title: "Ko", tags: ["ko", "rules"], relation: "Snapback avoids ko complications" },
    ],
    senseiQuote: {
      text: "In the snapback, the opponent's capture is the setup for your own.",
      attribution: "Sensei's Library",
    },
    proTip: "Always check snapback before playing a costly ko fight — it may resolve the position entirely without spending ko threats.",
    prev: { id: "net", title: "Net (Geta)" },
    next: { id: "ko", title: "Ko" },
  },
};

export function getEnrichment(conceptId: string): ConceptEnrichment | null {
  return CONCEPT_ENRICHMENTS[conceptId] ?? null;
}
