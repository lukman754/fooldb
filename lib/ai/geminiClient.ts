import { DatabaseSchema } from '@/types';

export async function validateApiKey(apiKey: string): Promise<string | null> {
  if (!apiKey || apiKey.trim() === '') return 'API Key is empty.';
  
  try {
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (res.ok) {
      return null; // Valid key
    }

    const data = await res.json();
    return data.error || 'Failed to authenticate API key.';
  } catch (err: unknown) {
    console.error('API key verification failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return msg || 'Failed to connect to the local validation server.';
  }
}

export async function generateRelationshipVerbs(schema: DatabaseSchema, apiKey: string): Promise<Record<string, string>> {
  if (!apiKey) {
    throw new Error('API Key is required. Please set your Gemini API Key in the Header settings (key icon).');
  }

  try {
    const res = await fetch('/api/generate-relations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey, schema }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to analyze relationships with Gemini AI.');
    }

    const parsedVerbs = await res.json();
    return parsedVerbs;
  } catch (err: unknown) {
    console.error('Gemini API call failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg || 'Failed to connect to the local AI analysis server.');
  }
}
