import { NextRequest, NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';
import { groqConfig } from '@/config/groq';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { conversation } = await request.json();

    const prompt = `
Analyze the following conversation message and determine if it indicates a decision being made.
If it does, provide a brief summary of the decision and a confidence score between 0 and 1.
Return the result as JSON with keys: isDecision (boolean), summary (string), confidence (number).

Message: ${conversation.text}
From: ${conversation.author}
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
      
      // Extract isDecision (look for true/false)
      const isDecisionMatch = text.match(/"isDecision"\s*:\s*(true|false)/i) || 
                             text.match(/isDecision\s*[:=]\s*(true|false)/i);
      const isDecision = isDecisionMatch ? isDecisionMatch[1].toLowerCase() === 'true' : false;
      
      // Extract summary (look for summary field)
      const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i) ||
                          text.match(/summary\s*[:=]\s*"([^"]+)"/i);
      const summary = summaryMatch ? summaryMatch[1] : '';
      
      // Extract confidence (look for number between 0 and 1)
      const confidenceMatch = text.match(/"confidence"\s*:\s*(\d*\.?\d+)/i) ||
                             text.match(/confidence\s*[:=]\s*(\d*\.?\d+)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;

      parsed = {
        isDecision,
        summary,
        confidence
      };
    }

    return NextResponse.json({
      isDecision: parsed.isDecision || false,
      summary: parsed.summary || '',
      confidence: parsed.confidence || 0,
    });
  } catch (error) {
    console.error('Error in decision detection:', error);
    return NextResponse.json(
      { error: 'Failed to detect decision' },
      { status: 500 }
    );
  }
}