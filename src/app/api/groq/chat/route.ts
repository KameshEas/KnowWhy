import { NextRequest, NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';
import { groqConfig } from '@/config/groq';

const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, model, temperature = 0.1, maxTokens = 512, stream = false } = await request.json();

    const config = groqConfig.models[model || groqConfig.defaultModel] || groqConfig.models[groqConfig.defaultModel];

    if (stream) {
      // Streaming response
      const stream = await groq.chat.completions.create({
        model: config.name,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      });

      // For streaming, we need to handle the response differently
      // This is a simplified version - in a real implementation, you'd need to handle the stream properly
      let result = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          result += content;
        }
      }
      
      return NextResponse.json({ text: result || "No answer available." });
    } else {
      // Non-streaming response
      const response = await groq.chat.completions.create({
        model: config.name,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      });

      return NextResponse.json({
        text: response.choices[0]?.message?.content || "No answer available."
      });
    }
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    );
  }
}