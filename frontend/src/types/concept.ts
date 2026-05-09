export type ConceptDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type SectionKind =
  | "mechanics"
  | "strategic"
  | "examples"
  | "variations"
  | "common_mistakes";

export interface MechanicsStep {
  step: number;
  text: string;
}

export interface ConceptSection {
  id: string;
  kind: SectionKind;
  heading: string;
  body: string;
  steps?: MechanicsStep[];
}

export interface RelatedConceptRef {
  id: string;
  title: string;
  tags: string[];
  relation: string;
}

export interface ConceptNavLink {
  id: string;
  title: string;
}

export interface SenseiQuote {
  text: string;
  attribution?: string;
}

export interface ConceptDetail {
  id: string;
  title: string;
  tags: string[];
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
