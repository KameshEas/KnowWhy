import { OpenAI } from "openai";
import { rateLimiter } from '@/utils/rate-limiter';

export const POST = async (req: Request) => {
  try {
    const { conversation } = await req.json();

    // Validate required parameters
    if (!conversation || !conversation.text) {
      return Response.json(
        { error: "Conversation with text is required" },
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
Analyze the following conversation message and determine if it indicates a decision being made.
If it does, provide a brief summary of the decision and a confidence score between 0 and 1.
Return the result as JSON with keys: isDecision (boolean), summary (string), confidence (number).

Message: ${conversation.text}
From: ${conversation.author}
`;

    const response = await client.chat.completions.create({
      model: "deepseek/deepseek-r1-0528:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
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
      isDecision: parsed.isDecision || false,
      summary: parsed.summary || '',
      confidence: parsed.confidence || 0,
      conversationId: conversation.id,
      model: response.model,
      usage: response.usage
    });
  } catch (error: any) {
    console.error("Decision Detection Error:", error);
    
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
      { error: error.message || "An error occurred during decision detection." },
      { status: 500 }
    );
  }
};