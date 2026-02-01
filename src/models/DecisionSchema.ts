/**
 * KnowWhy Decision Brief Schema
 * 
 * Defines the structure, confidence scoring, and validation rules for decision moments.
 * Based on Principal Engineer breakdown:
 * - What counts as a decision (explicit vs implicit)
 * - Trust boundaries (what gets stored, summarized, indexed)
 * - Source attribution (idempotent linking back to conversations)
 */

// ============================================================================
// DECISION MOMENT DEFINITION
// ============================================================================

/**
 * What counts as a "decision moment" for KnowWhy:
 * 
 * EXPLICIT decisions (high confidence, ~0.8-1.0):
 * - "We're going to [action]"
 * - "Let's ship with [technology]"
 * - "Decision: we'll [choice] because [reason]"
 * - Formal ADR (Architecture Decision Record) or RFC approval
 * 
 * IMPLICIT decisions (medium confidence, ~0.5-0.7):
 * - "Okay, that sounds good" (in response to a proposal)
 * - Status change from "in review" → "merged" (implicit approval)
 * - Consensus emerges without explicit yes (e.g., "no objections then?")
 * - "We tried X, it didn't work, so we switched to Y"
 * 
 * NOT decisions (low/zero confidence):
 * - Questions or brainstorming ("What if we...")
 * - Updates on existing decisions ("The rollout is on track")
 * - Meta-discussion ("Should we discuss this?")
 * - Trivial decisions (font colors, naming debates without resolution)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * SourceReference: Points back to the conversation(s) that led to the decision.
 * Enables:
 * - Audit trails
 * - RAG grounding (cite actual evidence)
 * - Trust (users can verify the decision)
 */
export interface SourceReference {
  /**
   * Source type: 'slack' | 'zoom' | 'googlemeet' | 'jira' | 'github' | 'upload'
   * Each type maps to specific metadata fields below
   */
  type: 'slack' | 'zoom' | 'googlemeet' | 'jira' | 'github' | 'upload';

  /**
   * External ID for idempotency (critical for backfill + incremental sync)
   * - Slack: messageId or threadId
   * - Zoom: transcript uuid + speaker index
   * - Jira: issueKey
   * - GitHub: PR number or commit SHA
   * - Upload: fileName + checksum
   */
  externalId: string;

  /**
   * Timestamp when the decision was mentioned/made
   */
  timestamp: Date;

  /**
   * URL or deep link to view the source in the original system
   * - Slack: https://workspace.slack.com/archives/C123/p1234567
   * - Zoom: https://zoom.us/recordingmanagement/detail?recordingId=xxx
   * - Jira: https://jira.example.com/browse/KEY-123
   */
  url?: string;

  /**
   * Speaker/author name (for transcripts, messages)
   */
  author?: string;

  /**
   * Optional: text snippet from the source (for citation/evidence)
   * Max 500 chars to avoid storing too much raw text
   */
  excerpt?: string;

  /**
   * Metadata specific to source type
   */
  metadata?: {
    // Slack
    channelId?: string;
    channelName?: string;
    threadId?: string;
    reactionCount?: number;

    // Zoom/transcript
    speakerId?: string;
    duration?: number; // seconds into transcript

    // Jira
    issueKey?: string;
    status?: string;
    priority?: string;

    // GitHub
    pullRequestNumber?: number;
    repository?: string;
  };
}

/**
 * DecisionBriefSchema: The core decision document
 * Stored in Postgres. Indexed for semantic search.
 */
export interface DecisionBrief {
  id: string; // Unique identifier (cuid)
  workspaceId: string; // Which Slack workspace / organization
  userId: string; // Who created/approved this brief

  // ---- Core Content ----

  /**
   * What was decided (one sentence summary, <150 chars)
   * Examples:
   * - "Migrate auth to Auth0"
   * - "Use React over Vue for frontend"
   * - "Ship feature X with beta flag for 2 weeks"
   */
  title: string;

  /**
   * The problem/context that necessitated the decision
   * Max 1000 chars. Should stand alone without the conversation.
   */
  problem: string;

  /**
   * Alternatives that were considered (don't store all discussion, just the candidate options)
   * e.g., ["Auth0", "Okta", "Firebase Auth", "Custom JWT"]
   * Allows: "Why did we choose X?" → Show what we rejected + why
   */
  optionsConsidered: string[];

  /**
   * Why this decision was made (the rationale)
   * Max 500 chars. Should directly address: cost, engineering effort, compliance, timeline, etc.
   * Example: "Auth0 chosen because: (1) SSO for enterprise, (2) 90-day free tier covers MVP, (3) strong compliance"
   */
  rationale: string;

  /**
   * Who was involved in making this decision
   * Names/emails. Enables: "Who made this call?" and accountability
   */
  participants: string[];

  /**
   * The actual decision text/status:
   * - pending: Candidate, waiting for approval
   * - approved: Human confirmed this is accurate
   * - archived: No longer relevant (superceded by newer decision)
   */
  status: 'pending' | 'approved' | 'archived';

  // ---- Provenance & Quality ----

  /**
   * Confidence score: 0-1
   * Set by detection agent. Communicates uncertainty to the user.
   * 
   * 0.9-1.0: Explicit decision in writing ("We decided...")
   * 0.7-0.9: Strong implicit decision ("Okay, let's do that")
   * 0.5-0.7: Consensus but less explicit
   * <0.5: Uncertain, may need human review
   * 
   * Used for:
   * - UI indicators (confidence badges)
   * - Filtering (show only high-confidence decisions)
   * - Model evaluation (track accuracy over time)
   */
  confidence: number;

  /**
   * sourceReferences: Array of conversations that led to this decision
   * Minimum: 1 (the message where decision was made)
   * Often more: context from days/weeks of discussion
   */
  sourceReferences: SourceReference[];

  /**
   * Tags for filtering and discovery
   * e.g., ["architecture", "infrastructure", "parity-check", "security"]
   * Populated manually OR by classifier (if explicit tag in message)
   */
  tags: string[];

  /**
   * decisionCandidateId: Link to the DetectionAgent output
   * Enables traceability: raw detection → human review → approved brief
   */
  decisionCandidateId?: string;

  // ---- Audit & Timestamps ----
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date; // When status changed to 'approved'
  approvedBy?: string; // User who approved
}

/**
 * DecisionCandidate: Output of the Detection Agent
 * Raw classifier output before human review.
 */
export interface DecisionCandidate {
  id: string;
  conversationId: string; // Reference to the message/transcript
  userId: string;

  /**
   * Is this a decision (not just discussion)?
   */
  isDecision: boolean;

  /**
   * One-line summary of what was decided (unstructured)
   */
  summary: string;

  /**
   * Confidence 0-1: How sure is the model?
   * Used to filter noise. E.g., only show >0.6 to user.
   */
  confidence: number;

  /**
   * Which prompt version / model generated this?
   * "v1", "v2-groq-70b", etc.
   * Essential for eval: "v1 had 60% accuracy, v2 is 75%"
   */
  agentVersion: string;

  createdAt: Date;
  updatedAt: Date;

  /**
   * Link to the approved DecisionBrief (1:1 when approved)
   */
  brief?: DecisionBrief;
}

// ============================================================================
// CONFIDENCE SCORING RUBRIC
// ============================================================================

/**
 * Guidance for the Decision Detection Agent to assign confidence scores
 */
export const CONFIDENCE_RUBRIC = {
  /**
   * 0.95-1.0: Explicit, unambiguous decision
   * - Message contains: "decide", "decision", "we will", "approved", "let's ship"
   * - Formal structure: "[DECISION]:" or ADR/RFC header
   * - Action: status changed from "in-review" → "merged" in tracked system
   * Example: "DECISION: We're adopting Rust for the CLI. Rationale: performance + memory safety."
   */
  explicit: {
    min: 0.95,
    max: 1.0,
    keywords: [
      'decided',
      'decision',
      'we will',
      'approved',
      "let's ship",
      'shipping',
      'merged',
      'going with',
      'settled on',
      'committed to',
    ],
  },

  /**
   * 0.70-0.95: Strong implicit decision
   * - Response to a proposal: "Okay, sounds good", "Let's do that", "I'm in"
   * - Lack of objection after proposal: "No blockers then?" → "Nope, let's go"
   * - Status change in workflow: Draft PR → Approved / In-progress → Done
   * - Team consensus emerges without explicit vote
   * Example: "That makes sense. Let's go with the Redis approach then."
   */
  strongImplicit: {
    min: 0.7,
    max: 0.95,
    keywords: [
      "sounds good",
      "let's do",
      "i'm in",
      "agreed",
      "no objections",
      'fine by me',
      'works for me',
      'approved',
      'green light',
      'go ahead',
    ],
  },

  /**
   * 0.50-0.70: Probable decision / consensus
   * - Emergent consensus without explicit approval
   * - Multiple people agreeing with minor reservations
   * - Retrospective decision identification: "We ended up using X instead of Y"
   * - Situation where inaction = decision (accepted a tradeoff)
   * Example: "Yeah, the trade-off there is worth it. Let's keep our current approach."
   */
  probableConsensus: {
    min: 0.5,
    max: 0.7,
    indicators: [
      'multiple people agreed',
      'no strong objections',
      'seemed to work well',
      'everyone on board',
      'we ended up with',
      'accepted the tradeoff',
    ],
  },

  /**
   * 0.25-0.50: Weak signal / likely not a decision
   * - Brainstorming or "what if" without commitment
   * - Someone suggests something; unclear if it was adopted
   * - One person proposing, no buy-in from team
   * - Update on existing decision (not a new decision)
   * Example: "What if we used a message queue here?"
   */
  weakSignal: {
    min: 0.25,
    max: 0.5,
    antipatterns: [
      'what if',
      'maybe',
      'could we',
      'should we consider',
      'thoughts on',
      'proposal',
      'is it worth',
    ],
  },

  /**
   * 0-0.25: Not a decision
   * - Meta-discussion ("Should we discuss this?")
   * - Factual updates ("The rollout is on track")
   * - Questions seeking information
   * - Trivial or very local decisions (font size, variable name)
   * Example: "Has anyone tested the API on iOS 17 yet?"
   */
  notADecision: {
    min: 0,
    max: 0.25,
    antipatterns: [
      'question',
      'has anyone',
      'do we know',
      'is it true',
      'update:',
      'just checking',
    ],
  },
};

// ============================================================================
// VALIDATION & HELPERS
// ============================================================================

/**
 * Validate that a DecisionBrief meets minimum schema requirements
 */
export function validateDecisionBrief(brief: Partial<DecisionBrief>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!brief.title || brief.title.length === 0) {
    errors.push('title is required');
  }
  if (!brief.problem || brief.problem.length === 0) {
    errors.push('problem is required');
  }
  if (!brief.optionsConsidered || brief.optionsConsidered.length === 0) {
    errors.push('optionsConsidered must have at least 1 option');
  }
  if (!brief.rationale || brief.rationale.length === 0) {
    errors.push('rationale is required');
  }
  if (!brief.participants || brief.participants.length === 0) {
    errors.push('participants must include at least 1 person');
  }
  if (brief.sourceReferences && brief.sourceReferences.length === 0) {
    errors.push('sourceReferences must have at least 1 source');
  }
  if (typeof brief.confidence !== 'number' || brief.confidence < 0 || brief.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get confidence tier name for UI display
 */
export function getConfidenceTier(
  confidence: number
): 'explicit' | 'strong' | 'probable' | 'weak' | 'invalid' {
  if (confidence >= 0.95) return 'explicit';
  if (confidence >= 0.7) return 'strong';
  if (confidence >= 0.5) return 'probable';
  if (confidence >= 0.25) return 'weak';
  return 'invalid';
}

/**
 * Format confidence for UI display
 */
export function formatConfidence(confidence: number): {
  tier: string;
  percentage: string;
  color: string;
  description: string;
} {
  const tier = getConfidenceTier(confidence);
  const percentage = `${Math.round(confidence * 100)}%`;

  const configs: Record<string, { color: string; description: string }> = {
    explicit: {
      color: 'green',
      description: 'High confidence decision',
    },
    strong: {
      color: 'blue',
      description: 'Strong implicit decision',
    },
    probable: {
      color: 'yellow',
      description: 'Probable decision',
    },
    weak: {
      color: 'orange',
      description: 'Weak signal, review needed',
    },
    invalid: {
      color: 'red',
      description: 'Likely not a decision',
    },
  };

  return {
    tier,
    percentage,
    ...configs[tier],
  };
}

// ============================================================================
// JSON SCHEMA (FOR LLM AGENTS & API VALIDATION)
// ============================================================================

export const DECISION_BRIEF_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'KnowWhy Decision Brief',
  type: 'object',
  required: ['title', 'problem', 'optionsConsidered', 'rationale', 'participants', 'sourceReferences', 'confidence'],
  properties: {
    title: {
      type: 'string',
      description: 'One-sentence summary of the decision (max 150 chars)',
      maxLength: 150,
      minLength: 10,
    },
    problem: {
      type: 'string',
      description: 'The problem or context requiring this decision (max 1000 chars)',
      maxLength: 1000,
      minLength: 20,
    },
    optionsConsidered: {
      type: 'array',
      description: 'List of alternatives that were evaluated',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 2,
        maxLength: 100,
      },
    },
    rationale: {
      type: 'string',
      description: 'Why this option was chosen (max 500 chars)',
      maxLength: 500,
      minLength: 10,
    },
    participants: {
      type: 'array',
      description: 'People involved in the decision',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    sourceReferences: {
      type: 'array',
      description: 'Conversations that led to this decision',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type', 'externalId', 'timestamp'],
        properties: {
          type: {
            type: 'string',
            enum: ['slack', 'zoom', 'googlemeet', 'jira', 'github', 'upload'],
          },
          externalId: {
            type: 'string',
            description: 'ID from the original system (messageId, uuid, etc)',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          url: {
            type: 'string',
            format: 'uri',
          },
          author: {
            type: 'string',
          },
          excerpt: {
            type: 'string',
            maxLength: 500,
          },
        },
      },
    },
    confidence: {
      type: 'number',
      description: 'Confidence score (0-1). 0.95+ = explicit, 0.7-0.95 = strong implicit, etc',
      minimum: 0,
      maximum: 1,
    },
    tags: {
      type: 'array',
      description: 'Category tags for filtering',
      items: {
        type: 'string',
      },
    },
  },
};
