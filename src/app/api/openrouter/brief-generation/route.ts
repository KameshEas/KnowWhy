import { OpenAI } from "openai";
import { rateLimiter } from '@/utils/rate-limiter';

export const POST = async (req: Request) => {
  try {
    const { decision, conversation } = await req.json();

    // Validate required parameters
    if (!decision || !conversation) {
      return Response.json(
        { error: "Decision and conversation are required" },
        { status: 400 }
      );
    }

    // Apply rate limiting before making the API call
    await rateLimiter.waitForRateLimit();

    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

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

    const response = await client.chat.completions.create({
      model: "deepseek/deepseek-r1-0528:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM");
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch (parseError) {
      throw new Error("Invalid JSON response from LLM");
    }

    return Response.json({
      decisionSummary: parsed.decisionSummary || decision.summary,
      problem: parsed.problem || '',
      optionsConsidered: parsed.optionsConsidered || [],
      rationale: parsed.rationale || '',
      participants: parsed.participants || [conversation.author],
      sourceReferences: parsed.sourceReferences || [{ conversationId: conversation.id, text: conversation.text }],
      model: response.model,
      usage: response.usage
    });
  } catch (error: any) {
    console.error("Brief Generation Error:", error);
    
    if (error.status === 401) {
      return Response.json(
        { error: "Invalid OpenRouter API key. Please check your configuration." },
        { status: 401 }
      );
    }
    
    if (error.status === 429) {
      return Response.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    return Response.json(
      { error: error.message || "An error occurred during brief generation." },
      { status: 500 }
    );
  }
};