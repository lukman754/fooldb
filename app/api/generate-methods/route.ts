import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { apiKey, tableName, columns }: { apiKey: string; tableName: string; columns: { name: string; type: string }[] } =
      await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API Key is empty." }, { status: 400 });
    }
    if (!tableName) {
      return NextResponse.json({ error: "Table name is missing." }, { status: 400 });
    }

    const fieldsList = columns
      .map((c) => `- ${c.name} (${c.type})`)
      .join("\n");

    const prompt = `
You are an expert software architect designing UML Class Diagrams.
Given the class (table) name and its fields (columns) below, generate a list of contextually appropriate and natural UML Class methods/operations (functions).

Instructions:
1. Generate 3 to 6 common, context-appropriate methods.
2. Each method must follow the standard UML signature:
   [visibility] methodName(param1: type, ...): returnType
   Use "+" for public and "-" for private.
3. Include standard database operations (such as save, delete, update, find) but customize them to match the class domain.
   For example:
   - For a "users" class: "+ verifyPassword(password: String): boolean", "+ updateEmail(newEmail: String): void"
   - For an "orders" class: "+ calculateTotal(): double", "+ checkout(): boolean", "+ cancelOrder(): void"
   - For a "products" class: "+ checkStock(qty: int): boolean", "+ updatePrice(price: double): void"
4. Keep signatures clean, concise, and professional.
5. Respond STRICTLY with a raw JSON array of strings containing only the UML method signatures. Do not include markdown code block syntax (like \`\`\`json), no trailing commas, and no explanations.

Example JSON Output:
[
  "+ calculateTotal(): double",
  "+ checkout(): boolean",
  "+ cancelOrder(): void"
]

Class Name: ${tableName}
Fields/Columns:
${fieldsList}
`;

    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: prompt,
    });

    const responseText = interaction.output_text?.trim() || "";
    if (!responseText) {
      throw new Error("Received empty response from Gemini API.");
    }

    const jsonText = responseText
      .replace(/^```json\s*/i, "")
      .replace(/```$/, "")
      .trim();

    const parsedMethods = JSON.parse(jsonText);
    if (!Array.isArray(parsedMethods)) {
      throw new Error("Gemini AI response is not a valid JSON array.");
    }

    return NextResponse.json(parsedMethods);
  } catch (err: unknown) {
    console.error("Server generate-methods endpoint failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || "AI method generation failed." },
      { status: 500 },
    );
  }
}
