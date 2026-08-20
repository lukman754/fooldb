export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  mimeType: string;
}

const ROOT_FOLDER_NAME = 'fooldb';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export class DriveApi {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error?.message || `Drive API Error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // Find a folder by name inside a specific parent (or root if parentId is not provided)
  private async findFolder(name: string, parentId?: string): Promise<string | null> {
    const parentQuery = parentId ? `'${parentId}' in parents` : `'root' in parents`;
    const q = `mimeType='${FOLDER_MIME_TYPE}' and name='${name}' and ${parentQuery} and trashed=false`;
    
    const data = await this.fetch(
      `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
        q,
        fields: 'files(id)',
        spaces: 'drive',
      })}`
    );
    
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  // Create a folder inside a specific parent (or root if not provided)
  private async createFolder(name: string, parentId?: string): Promise<string> {
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name,
      mimeType: FOLDER_MIME_TYPE,
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    const data = await this.fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
    
    return data.id;
  }

  // Get or create the root 'fooldb' folder
  async getOrCreateRootFolder(): Promise<string> {
    let rootId = await this.findFolder(ROOT_FOLDER_NAME);
    if (!rootId) {
      rootId = await this.createFolder(ROOT_FOLDER_NAME);
    }
    return rootId;
  }

  // Get all project folders inside 'fooldb'
  async getProjects(rootFolderId: string): Promise<DriveFile[]> {
    const q = `mimeType='${FOLDER_MIME_TYPE}' and '${rootFolderId}' in parents and trashed=false`;
    const data = await this.fetch(
      `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
        q,
        fields: 'files(id,name,modifiedTime)',
        orderBy: 'modifiedTime desc',
      })}`
    );
    return data.files || [];
  }

  // Create a new project folder inside 'fooldb'
  async createProject(name: string, rootFolderId: string): Promise<DriveFile> {
    const id = await this.createFolder(name, rootFolderId);
    return {
      id,
      name,
      modifiedTime: new Date().toISOString(),
      mimeType: FOLDER_MIME_TYPE,
    };
  }

  // Get all diagram files inside a project folder
  async getDiagrams(projectId: string): Promise<DriveFile[]> {
    const q = `(mimeType='text/plain' or mimeType='application/xml') and '${projectId}' in parents and trashed=false`;
    const data = await this.fetch(
      `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
        q,
        fields: 'files(id,name,modifiedTime,size)',
        orderBy: 'modifiedTime desc',
      })}`
    );
    return data.files || [];
  }

  // Delete any file or folder
  async deleteItem(id: string): Promise<void> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to delete item ${id}`);
    }
  }

  // Download XML content
  async downloadXml(fileId: string): Promise<string> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    if (!res.ok) throw new Error('Failed to download file');
    return res.text();
  }
}
