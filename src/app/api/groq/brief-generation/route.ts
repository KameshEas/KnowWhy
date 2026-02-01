import { NextRequest, NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';
import { groqConfig } from '@/config/groq';

const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { decision, conversation } = await request.json();

    const prompt = `
Given this decision summary: ${decision.summary}

And the conversation context: ${conversation.text}
From: ${conversation.author}

Generate a detailed decision brief. Return JSON with keys:
- decisionSummary (string)
- problem (string)
- optionsConsidered (array of strings)
- rationale (string)
- participants (array of strings)
- sourceReferences (array of objects with conversationId and text)
`;

    const response = await groq.chat.completions.create({
      model: groqConfig.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM");
    }

    // Parse the response - Groq may return text instead of JSON
    let parsed;
    try {
      // Try to parse as JSON first
      parsed = JSON.parse(content.trim());
    } catch (parseError) {
      // If JSON parsing fails, try to extract values from text response
      const text = content.trim();
      
      // Extract decisionSummary
      const decisionSummaryMatch = text.match(/"decisionSummary"\s*:\s*"([^"]+)"/i) ||
                                  text.match(/decisionSummary\s*[:=]\s*"([^"]+)"/i);
      const decisionSummary = decisionSummaryMatch ? decisionSummaryMatch[1] : decision.summary;
      
      // Extract problem
      const problemMatch = text.match(/"problem"\s*:\s*"([^"]+)"/i) ||
                          text.match(/problem\s*[:=]\s*"([^"]+)"/i);
      const problem = problemMatch ? problemMatch[1] : '';
      
      // Extract optionsConsidered (look for array or comma-separated list)
      let optionsConsidered: string[] = [];
      const optionsMatch = text.match(/"optionsConsidered"\s*:\s*\[([^\]]+)\]/i) ||
                          text.match(/optionsConsidered\s*[:=]\s*\[([^\]]+)\]/i);
      if (optionsMatch) {
        const optionsText = optionsMatch[1];
        optionsConsidered = optionsText.split(',').map(opt => 
          opt.trim().replace(/"/g, '').replace(/'/g, '')
        ).filter(opt => opt.length > 0);
      } else {
        // Look for bullet points or numbered lists
        const bulletMatch = text.match(/(?:-|\*|\d+\.)\s*([^\n]+)/gi);
        if (bulletMatch) {
          optionsConsidered = bulletMatch.map(opt => opt.replace(/^-|\*|\d+\.\s*/g, '').trim());
        }
      }
      
      // Extract rationale
      const rationaleMatch = text.match(/"rationale"\s*:\s*"([^"]+)"/i) ||
                            text.match(/rationale\s*[:=]\s*"([^"]+)"/i);
      const rationale = rationaleMatch ? rationaleMatch[1] : '';
      
      // Extract participants
      const participantsMatch = text.match(/"participants"\s*:\s*\[([^\]]+)\]/i) ||
                               text.match(/participants\s*[:=]\s*\[([^\]]+)\]/i);
      let participants = [conversation.author];
      if (participantsMatch) {
        const participantsText = participantsMatch[1];
        participants = participantsText.split(',').map(p => 
          p.trim().replace(/"/g, '').replace(/'/g, '')
        ).filter(p => p.length > 0);
      }

      parsed = {
        decisionSummary,
        problem,
        optionsConsidered,
        rationale,
        participants
      };
    }

    return NextResponse.json({
      decisionSummary: parsed.decisionSummary || decision.summary,
      problem: parsed.problem || '',
      optionsConsidered: parsed.optionsConsidered || [],
      rationale: parsed.rationale || '',
      participants: parsed.participants || [conversation.author],
      sourceReferences: parsed.sourceReferences || [{ conversationId: conversation.id, text: conversation.text }],
    });
  } catch (error) {
    console.error('Error in brief generation:', error);
    return NextResponse.json(
      { error: 'Failed to generate brief' },
      { status: 500 }
    );
  }
}