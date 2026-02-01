/**
 * Decision Schema Utilities
 * 
 * Helper functions for working with DecisionBrief and DecisionCandidate
 * throughout the application (agents, API, UI, validation)
 */

import {
  DecisionBrief,
  DecisionCandidate,
  SourceReference,
  CONFIDENCE_RUBRIC,
  getConfidenceTier,
  formatConfidence,
  validateDecisionBrief,
} from './DecisionSchema';

// ============================================================================
// DECISION CANDIDATE HELPERS
// ============================================================================

/**
 * Create a new DecisionCandidate from a message or conversation
 */
export function createDecisionCandidate(params: {
  conversationId: string;
  userId: string;
  summary: string;
  confidence: number;
  isDecision: boolean;
  agentVersion?: string;
}): DecisionCandidate {
  return {
    id: `cand_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    conversationId: params.conversationId,
    userId: params.userId,
    isDecision: params.isDecision,
    summary: params.summary,
    confidence: Math.max(0, Math.min(1, params.confidence)), // Clamp 0-1
    agentVersion: params.agentVersion || 'v1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Filter candidates by confidence threshold
 * Useful for: "Show only high-confidence decisions" or "Flag weak signals for review"
 */
export function filterCandidatesByConfidence(
  candidates: DecisionCandidate[],
  minConfidence: number = 0.5
): DecisionCandidate[] {
  return candidates.filter((c) => c.confidence >= minConfidence);
}

/**
 * Group candidates by confidence tier
 */
export function groupCandidatesByTier(
  candidates: DecisionCandidate[]
): Record<string, DecisionCandidate[]> {
  const grouped: Record<string, DecisionCandidate[]> = {
    explicit: [],
    strong: [],
    probable: [],
    weak: [],
    invalid: [],
  };

  candidates.forEach((candidate) => {
    const tier = getConfidenceTier(candidate.confidence);
    grouped[tier].push(candidate);
  });

  return grouped;
}

// ============================================================================
// DECISION BRIEF BUILDERS
// ============================================================================

/**
 * Create a Decision Brief from a DetectionCandidate + additional context
 * This is called after the Brief Generation Agent processes a candidate
 */
export function createDecisionBrief(params: {
  workspaceId: string;
  userId: string;
  title: string;
  problem: string;
  optionsConsidered: string[];
  rationale: string;
  participants: string[];
  confidence: number;
  sourceReferences: SourceReference[];
  tags?: string[];
  decisionCandidateId?: string;
}): DecisionBrief {
  const brief: DecisionBrief = {
    id: `brief_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    workspaceId: params.workspaceId,
    userId: params.userId,
    title: params.title,
    problem: params.problem,
    optionsConsidered: params.optionsConsidered,
    rationale: params.rationale,
    participants: params.participants,
    status: 'pending',
    confidence: Math.max(0, Math.min(1, params.confidence)),
    sourceReferences: params.sourceReferences,
    tags: params.tags || [],
    decisionCandidateId: params.decisionCandidateId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Validate before returning
  const { valid, errors } = validateDecisionBrief(brief);
  if (!valid) {
    throw new Error(`Failed to create DecisionBrief: ${errors.join('; ')}`);
  }

  return brief;
}

/**
 * Create a SourceReference for Slack
 */
export function createSlackSourceReference(params: {
  messageId: string;
  timestamp: Date;
  channelId: string;
  channelName: string;
  author?: string;
  excerpt?: string;
  threadId?: string;
  workspaceUrl?: string; // e.g., "https://myworkspace.slack.com"
}): SourceReference {
  const url = params.workspaceUrl
    ? `${params.workspaceUrl}/archives/${params.channelId}/p${params.messageId.replace('.', '')}`
    : undefined;

  return {
    type: 'slack',
    externalId: params.messageId,
    timestamp: params.timestamp,
    url,
    author: params.author,
    excerpt: params.excerpt ? params.excerpt.slice(0, 500) : undefined,
    metadata: {
      channelId: params.channelId,
      channelName: params.channelName,
      threadId: params.threadId,
    },
  };
}

/**
 * Create a SourceReference for a transcript (Zoom, Google Meet, etc.)
 */
export function createTranscriptSourceReference(params: {
  type: 'zoom' | 'googlemeet';
  transcriptId: string;
  timestamp: Date;
  speakerId: string;
  speakerName?: string;
  excerpt?: string;
  url?: string;
  durationSeconds?: number;
}): SourceReference {
  return {
    type: params.type,
    externalId: params.transcriptId,
    timestamp: params.timestamp,
    url: params.url,
    author: params.speakerName || params.speakerId,
    excerpt: params.excerpt ? params.excerpt.slice(0, 500) : undefined,
    metadata: {
      speakerId: params.speakerId,
      duration: params.durationSeconds,
    },
  };
}

// ============================================================================
// APPROVAL & STATUS MANAGEMENT
// ============================================================================

/**
 * Approve a Decision Brief (status change: pending → approved)
 */
export function approveBrief(
  brief: DecisionBrief,
  approvedBy: string
): DecisionBrief {
  return {
    ...brief,
    status: 'approved',
    approvedAt: new Date(),
    approvedBy,
    updatedAt: new Date(),
  };
}

/**
 * Archive a Decision Brief (superceded by a newer decision)
 */
export function archiveBrief(brief: DecisionBrief): DecisionBrief {
  return {
    ...brief,
    status: 'archived',
    updatedAt: new Date(),
  };
}

/**
 * Update a Decision Brief (edit after creation)
 */
export function updateBrief(
  brief: DecisionBrief,
  updates: Partial<Omit<DecisionBrief, 'id' | 'createdAt'>>
): DecisionBrief {
  const updated = { ...brief, ...updates, updatedAt: new Date() };
  const { valid, errors } = validateDecisionBrief(updated);
  if (!valid) {
    throw new Error(`Failed to update DecisionBrief: ${errors.join('; ')}`);
  }
  return updated;
}

// ============================================================================
// FORMATTING & DISPLAY
// ============================================================================

/**
 * Format a Decision Brief for display (remove sensitive fields if needed)
 */
export function formatBriefForDisplay(brief: DecisionBrief): Record<string, any> {
  return {
    id: brief.id,
    title: brief.title,
    problem: brief.problem,
    optionsConsidered: brief.optionsConsidered,
    rationale: brief.rationale,
    participants: brief.participants,
    status: brief.status,
    confidence: formatConfidence(brief.confidence),
    tags: brief.tags,
    sourceCount: brief.sourceReferences.length,
    createdAt: brief.createdAt.toISOString(),
    approvedAt: brief.approvedAt?.toISOString(),
  };
}

/**
 * Format a source reference for inline citation
 * Example: "Slack #engineering (Jan 28, 2:32 PM)"
 */
export function formatSourceReference(source: SourceReference): string {
  const timestamp = source.timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  switch (source.type) {
    case 'slack':
      return `Slack ${source.metadata?.channelName || 'message'} (${timestamp})`;
    case 'zoom':
      return `Zoom transcript (${timestamp})`;
    case 'googlemeet':
      return `Google Meet (${timestamp})`;
    case 'jira':
      return `Jira ${source.metadata?.issueKey || 'issue'} (${timestamp})`;
    case 'github':
      return `GitHub ${source.metadata?.repository || 'repo'} (${timestamp})`;
    case 'upload':
      return `Upload (${timestamp})`;
    default:
      return `Decision (${timestamp})`;
  }
}

/**
 * Generate a markdown-formatted citation for a source
 * Use in: RAG responses, decision detail page
 */
export function generateMarkdownCitation(source: SourceReference): string {
  const formattedSource = formatSourceReference(source);

  if (source.url) {
    return `[${formattedSource}](${source.url})`;
  }

  return formattedSource;
}

// ============================================================================
// SEARCH & FILTERING
// ============================================================================

/**
 * Search briefs by title or problem (basic text match)
 * For more advanced search, use vector embeddings
 */
export function searchBriefsByText(
  briefs: DecisionBrief[],
  query: string
): DecisionBrief[] {
  const lowercaseQuery = query.toLowerCase();
  return briefs.filter(
    (brief) =>
      brief.title.toLowerCase().includes(lowercaseQuery) ||
      brief.problem.toLowerCase().includes(lowercaseQuery) ||
      brief.rationale.toLowerCase().includes(lowercaseQuery) ||
      brief.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
  );
}

/**
 * Filter briefs by tag
 */
export function filterBriefsByTag(briefs: DecisionBrief[], tag: string): DecisionBrief[] {
  return briefs.filter((brief) => brief.tags.includes(tag));
}

/**
 * Filter briefs by date range
 */
export function filterBriefsByDateRange(
  briefs: DecisionBrief[],
  startDate: Date,
  endDate: Date
): DecisionBrief[] {
  return briefs.filter(
    (brief) => brief.createdAt >= startDate && brief.createdAt <= endDate
  );
}

/**
 * Filter briefs by participant
 * Useful for: "What decisions did Alice make?"
 */
export function filterBriefsByParticipant(
  briefs: DecisionBrief[],
  participantName: string
): DecisionBrief[] {
  return briefs.filter((brief) =>
    brief.participants.some((p) =>
      p.toLowerCase().includes(participantName.toLowerCase())
    )
  );
}

// ============================================================================
// AUDIT & QUALITY TRACKING
// ============================================================================

/**
 * Evaluate a Decision Brief for quality
 * Returns: scores for completeness, clarity, citations
 */
export function evaluateBriefQuality(brief: DecisionBrief): {
  completenessScore: number; // 0-1: all required fields filled
  clarityScore: number; // 0-1: text is concise and clear
  citationScore: number; // 0-1: has sources, excerpts
  overallScore: number;
} {
  let completenessScore = 1.0;
  if (brief.title.length < 10) completenessScore -= 0.1;
  if (brief.problem.length < 50) completenessScore -= 0.1;
  if (brief.optionsConsidered.length < 2) completenessScore -= 0.2;
  if (brief.participants.length < 1) completenessScore -= 0.1;

  let clarityScore = 1.0;
  if (brief.title.length > 150) clarityScore -= 0.1;
  if (brief.problem.length > 1000) clarityScore -= 0.1;
  if (brief.rationale.length < 20) clarityScore -= 0.2;

  let citationScore = 1.0;
  if (brief.sourceReferences.length === 0) {
    citationScore = 0;
  } else if (brief.sourceReferences.some((s) => !s.excerpt)) {
    citationScore -= 0.2;
  }

  const overallScore = (completenessScore + clarityScore + citationScore) / 3;

  return {
    completenessScore: Math.round(completenessScore * 100) / 100,
    clarityScore: Math.round(clarityScore * 100) / 100,
    citationScore: Math.round(citationScore * 100) / 100,
    overallScore: Math.round(overallScore * 100) / 100,
  };
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export {
  DecisionBrief,
  DecisionCandidate,
  SourceReference,
  validateDecisionBrief,
  getConfidenceTier,
  formatConfidence,
  CONFIDENCE_RUBRIC,
};
