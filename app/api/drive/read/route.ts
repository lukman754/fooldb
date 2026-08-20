import { auth } from "@/auth";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();

  // @ts-expect-error: NextAuth Session lacks accessToken
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    // @ts-expect-error: NextAuth Session lacks accessToken
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "text" }
    );

    return new NextResponse(response.data as string, {
      headers: {
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    console.error("Error reading from Drive:", error);
    return NextResponse.json({ error: "Failed to read file from Drive" }, { status: 500 });
  }
}
