import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { DatabaseSchema, Table, Column, Relationship } from "@/types";

export async function POST(request: Request) {
  try {
    const { apiKey, schema }: { apiKey: string; schema: DatabaseSchema } =
      await request.json();
    if (!apiKey) {
      return NextResponse.json({ error: "API Key is empty." }, { status: 400 });
    }
    if (!schema) {
      return NextResponse.json(
        { error: "Database Schema is missing." },
        { status: 400 },
      );
    }

    const tablesSummary = schema.tables
      .map((t: Table) => {
        const cols = t.columns
          .map((c: Column) => `${c.name} (${c.type})`)
          .join(", ");
        return `- Table "${t.name}": columns [${cols}]`;
      })
      .join("\n");

    const relsSummary = schema.relationships
      .map((r: Relationship) => {
        return `- Relationship ID "${r.id}": Table "${r.targetTable}" referencing Parent Table "${r.sourceTable}" on columns (${r.targetColumns.join(",")})`;
      })
      .join("\n");

    const prompt = `
You are a database architect expert in Indonesian.
Given the database schema below, analyze the tables, columns, and foreign keys, and determine a natural, contextually appropriate Indonesian action verb for each relationship.

Instructions:
1. Write natural active or passive verbs representing how the source/target tables interact.
   For example:
   - "users" and "leave_requests" -> "Menyetujui" / "Menolak" or "Mengajukan"
   - "attendance" and "employees" -> "Melakukan"
   - "payroll" and "salary_slips" -> "Menghasilkan"
   - "qr_scan_logs" and "employees" -> "Melakukan Pemindaian"
2. Keep the verb concise, usually 1 to 3 words.
3. Respond STRICTLY with a raw JSON object mapping the Relationship ID to the determined Indonesian verb. Do not include markdown code block syntax (like \`\`\`json), no trailing commas, and no explanations.

JSON Format:
{
  "rel_id": "Indonesian Verb"
}

Database Tables:
${tablesSummary}

Relationships to analyze:
${relsSummary}
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

    const parsedVerbs = JSON.parse(jsonText);
    return NextResponse.json(parsedVerbs);
  } catch (err: unknown) {
    console.error("Server generate-relations endpoint failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || "AI relationship mapping failed." },
      { status: 500 },
    );
  }
}
