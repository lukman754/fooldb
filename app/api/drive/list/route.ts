import { auth } from "@/auth";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();

  // @ts-expect-error
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    // @ts-expect-error
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Only query files created by this app (this matches the drive.file scope)
    const response = await drive.files.list({
      q: "mimeType='application/xml' and trashed=false",
      fields: "files(id, name, modifiedTime)",
      orderBy: "modifiedTime desc",
    });

    return NextResponse.json(response.data.files || []);
  } catch (error) {
    console.error("Error listing Drive files:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}
