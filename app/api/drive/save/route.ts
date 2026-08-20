import { auth } from "@/auth";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();

  // @ts-expect-error: NextAuth Session lacks accessToken
  const accessToken = session?.accessToken as string | undefined;

  if (!session || !accessToken) {
    console.error("[drive/save] No session or accessToken. Session:", JSON.stringify(session));
    return NextResponse.json({ error: "Unauthorized: no access token in session" }, { status: 401 });
  }

  try {
    const { filename, content, fileId } = await req.json();

    if (!filename || !content) {
      return NextResponse.json({ error: "Missing filename or content" }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const fileMetadata = {
      name: filename,
      mimeType: "application/xml",
    };

    const media = {
      mimeType: "application/xml",
      body: content,
    };

    let file;

    if (fileId) {
      const response = await drive.files.update({
        fileId: fileId,
        requestBody: fileMetadata,
        media: media,
        fields: "id, name",
      });
      file = response.data;
    } else {
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, name",
      });
      file = response.data;
    }

    return NextResponse.json(file);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error saving to Drive:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
