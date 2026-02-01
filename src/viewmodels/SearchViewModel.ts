import { DecisionBrief } from '@/models/DecisionBrief';
import { LLMService } from '@/services/LLMService';

export class SearchViewModel {
  static async askKnowWhy(question: string, briefs: DecisionBrief[], model?: string, stream: boolean = false): Promise<string> {
    if (briefs.length === 0) {
      return "No decision briefs available to answer questions.";
    }

    const prompt = `
You are KnowWhy, an AI assistant that answers questions about past decisions made in team conversations.

Answer the following question using ONLY the information from the provided decision briefs below.
If the question cannot be fully answered from the briefs, say so clearly.
Always cite the specific decision brief(s) you used as sources (by their decisionSummary).
Do not make up information or hallucinate answers.

Question: ${question}

Decision Briefs:
${briefs.map((brief, idx) => `
Brief ${idx + 1}:
- Summary: ${brief.decisionSummary}
- Problem: ${brief.problem}
- Options Considered: ${brief.optionsConsidered.join(', ')}
- Rationale: ${brief.rationale}
- Participants: ${brief.participants.join(', ')}
- Sources: ${brief.sourceReferences.map(ref => ref.text).join('; ')}
`).join('\n')}
`;

    try {
      const response = await LLMService.askQuestion(prompt, model, stream);
      return response;
    } catch (error) {
      console.error('Error asking KnowWhy:', error);
      return "Sorry, I couldn't process your question at this time.";
    }
  }
}