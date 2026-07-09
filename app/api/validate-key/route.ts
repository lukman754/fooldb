import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key is empty.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    // Test the API key validity using a small fast interactions call
    await ai.interactions.create({
      model: 'gemini-2.5-flash',
      input: 'ping',
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Server validate-key endpoint failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || 'Failed to authenticate with Gemini API.' },
      { status: 400 }
    );
  }
}
