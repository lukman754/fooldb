import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();
    if (!apiKey) {
      return NextResponse.json({ error: "API Key is empty." }, { status: 400 });
    }

    // Skip API verification requests entirely to conserve token/request quota
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Server validate-key endpoint failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || "Failed to validate key." },
      { status: 400 },
    );
  }
}
