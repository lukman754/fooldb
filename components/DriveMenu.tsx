"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Download, LogIn, LogOut, Loader2, Save, X } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

interface DriveMenuProps {
  getCurrentXml?: () => string | null;
  onLoadXml?: (xml: string) => void;
  fileName?: string;
  projectId?: string | null;
  fileId?: string | null;
}

export interface DriveMenuRef {
  triggerSave: () => void;
}

// Helper: build a multipart/related body for Drive upload
function buildMultipartBody(filename: string, content: string, boundary: string, projectId?: string | null) {
  const metadataObj: { name: string; mimeType: string; parents?: string[] } = { name: filename, mimeType: "text/plain" };
  if (projectId) {
    metadataObj.parents = [projectId];
  }
  const metadata = JSON.stringify(metadataObj);
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`
  );
}

export const DriveMenu = forwardRef<DriveMenuRef, DriveMenuProps>(({ getCurrentXml, onLoadXml, fileName = "diagram.xml", projectId, fileId }, ref) => {
  const { data: session, status } = useSession();
  // @ts-expect-error: NextAuth Session lacks accessToken
  const accessToken: string | undefined = session?.accessToken;

  const [isSaving, setIsSaving] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchFiles = async () => {
    if (!accessToken) return;
    setIsLoadingFiles(true);
    try {
      const query = projectId 
        ? `(mimeType='text/plain' or mimeType='application/xml') and '${projectId}' in parents and trashed=false`
        : `(mimeType='text/plain' or mimeType='application/xml') and trashed=false`;

      const res = await fetch(
        "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: query,
          fields: "files(id,name,modifiedTime)",
          orderBy: "modifiedTime desc",
        }),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Failed to list drive files", e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isListOpen && session) fetchFiles();
  }, [isListOpen, session]);

  const handleSaveToDrive = async () => {
    if (!accessToken) return;
    const xmlToSave = getCurrentXml ? getCurrentXml() : null;
    if (!xmlToSave) return;
    setIsSaving(true);
    try {
      const boundary = "fooldb_boundary_" + Date.now();
      const body = buildMultipartBody(fileName, xmlToSave, boundary, currentFileId ? null : projectId);

      let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name";
      let method = "POST";

      if (currentFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${currentFileId}?uploadType=multipart&fields=id,name`;
        method = "PATCH";
      }

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentFileId(data.id);
        setSaveStatus('success');
        setSaveError(null);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setSaveError(data.error?.message || 'Save failed');
        setTimeout(() => setSaveStatus('idle'), 5000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveStatus('error');
      setSaveError(msg);
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    triggerSave: handleSaveToDrive,
  }));

  const handleLoadFile = async (fileId: string) => {
    if (!accessToken) return;
    setLoadingFileId(fileId);
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const xml = await res.text();
        if (onLoadXml) onLoadXml(xml);
        setCurrentFileId(fileId);
        setIsListOpen(false);
      }
    } catch (e) {
      console.error("Failed to load file", e);
    } finally {
      setLoadingFileId(null);
    }
  };

  // Initial load if fileId is provided in URL
  useEffect(() => {
    if (fileId && accessToken && currentFileId !== fileId) {
      handleLoadFile(fileId);
    }
  }, [fileId, accessToken]);

  if (status === "loading") {
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors whitespace-nowrap"
        title="Login with Google to save to Drive"
      >
        <img
          src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000"
          alt="Google Drive"
          className="w-3.5 h-3.5 shrink-0"
        />
        <span className="hidden lg:inline">Google Drive</span>
        <LogIn className="w-3 h-3 shrink-0 opacity-60" />
      </button>
    );
  }

  return (
    <div className="relative flex items-center gap-1">
      {/* Inline save status toast */}
      {saveStatus !== 'idle' && (
        <div className={`absolute bottom-[-32px] right-0 z-50 text-[10px] rounded px-2 py-1 whitespace-nowrap font-medium shadow-lg ${
          saveStatus === 'success'
            ? 'bg-green-900/90 text-green-300 border border-green-800'
            : 'bg-red-900/90 text-red-300 border border-red-800'
        }`}>
          {saveStatus === 'success' ? '✓ Saved to Drive' : `✗ ${saveError}`}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSaveToDrive}
        disabled={isSaving}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-50 shrink-0 ${
          saveStatus === 'success'
            ? 'border-green-700 bg-green-950/40 text-green-400'
            : saveStatus === 'error'
            ? 'border-red-700 bg-red-950/40 text-red-400'
            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-green-700 hover:bg-green-950/30 hover:text-green-400'
        }`}
        title={`Save "${fileName}" to Google Drive`}
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      </button>

      {/* Open from Drive */}
      <div className="relative">
        <button
          onClick={() => setIsListOpen(!isListOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-blue-700 hover:bg-blue-950/30 hover:text-blue-400 transition-colors shrink-0"
          title="Open from Google Drive"
        >
          <img
            src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000"
            alt="Google Drive"
            className="w-3.5 h-3.5"
          />
        </button>

        {isListOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsListOpen(false)} />
            <div className="absolute right-0 mt-1.5 w-72 bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 z-30 overflow-hidden">
              <div className="p-3 border-b border-zinc-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <img
                    src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000"
                    alt="Google Drive"
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Google Drive</p>
                    <p className="text-[10px] text-zinc-500 truncate max-w-[180px]">{session.user?.email}</p>
                  </div>
                </div>
                <button onClick={() => setIsListOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {isLoadingFiles ? (
                  <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>
                ) : files.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center p-4">No saved files found.</div>
                ) : (
                  files.map(f => (
                    <button
                      key={f.id}
                      onClick={() => handleLoadFile(f.id)}
                      disabled={loadingFileId === f.id}
                      className="flex items-center justify-between w-full p-2 text-left text-xs hover:bg-zinc-800 rounded-md group transition-colors"
                    >
                      <div className="truncate pr-2 flex-1">
                        <div className="font-medium text-zinc-200 truncate">{f.name}</div>
                        <div className="text-[10px] text-zinc-500">{new Date(f.modifiedTime).toLocaleDateString()}</div>
                      </div>
                      {loadingFileId === f.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
                        : <Download className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400 shrink-0 transition-colors" />
                      }
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut()}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900/40 hover:text-red-300 transition-colors shrink-0"
        title={`Sign out (${session.user?.name})`}
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

DriveMenu.displayName = "DriveMenu";
