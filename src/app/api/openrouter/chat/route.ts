import { OpenAI } from "openai";
import { rateLimiter } from '@/utils/rate-limiter';

export const POST = async (req: Request) => {
  try {
    const { prompt, model = "deepseek/deepseek-r1-0528:free", temperature = 0.7, maxTokens = 512, stream = false } = await req.json();

    // Validate required parameters
    if (!prompt) {
      return Response.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Apply rate limiting before making the API call
    await rateLimiter.waitForRateLimit();

    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

    if (stream) {
      // Streaming response
      const stream = await client.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: temperature,
        stream: true,
      });

      // Create a ReadableStream to handle the streaming response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                controller.enqueue(new TextEncoder().encode(content));
              }
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked',
        },
      });
    } else {
      // Non-streaming response
      const response = await client.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: temperature,
      });

      return Response.json({ 
        text: response.choices[0].message.content,
        model: response.model,
        usage: response.usage
      });
    }
  } catch (error: any) {
    console.error("OpenRouter API Error:", error);
    
    // Handle specific OpenRouter errors
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
      { error: error.message || "An error occurred while processing your request." },
      { status: 500 }
    );
  }
};
