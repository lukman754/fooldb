'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Loader2, Trash2, Plus, LogOut, Folder, FileCode2, ChevronRight, FolderOpen, ArrowLeft } from 'lucide-react';
import { DriveApi, DriveFile } from '@/lib/drive/driveApi';

function ProjectList({ 
  accessToken, 
  onSelectProject 
}: { 
  accessToken: string; 
  onSelectProject: (proj: DriveFile) => void;
}) {
  const [projects, setProjects] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [rootId, setRootId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const api = new DriveApi(accessToken);
        const root = await api.getOrCreateRootFolder();
        if (!mounted) return;
        setRootId(root);
        const projs = await api.getProjects(root);
        if (!mounted) return;
        setProjects(projs);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat projects');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [accessToken]);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rootId) return;
    if (!newProjectName.trim()) return;
    
    setCreating(true);
    try {
      const api = new DriveApi(accessToken);
      const newProj = await api.createProject(newProjectName.trim(), rootId);
      setProjects([newProj, ...projects]);
      setShowCreateModal(false);
      setNewProjectName('');
    } catch (e) {
      alert('Gagal membuat project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projId: string, projName: string) => {
    if (!confirm(`Hapus project "${projName}" beserta isinya?`)) return;
    setDeletingId(projId);
    try {
      const api = new DriveApi(accessToken);
      await api.deleteItem(projId);
      setProjects((prev) => prev.filter((p) => p.id !== projId));
    } catch (e) {
      alert('Gagal menghapus project');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
  if (error) return <div className="py-16 text-center text-red-400 bg-red-950/20 rounded-xl">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Folder className="w-5 h-5 text-blue-500" />
          Projects Anda
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Project Baru
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleCreate}>
              <div className="p-5 border-b border-zinc-800/60">
                <h3 className="text-lg font-semibold text-zinc-100">Project Baru</h3>
                <p className="text-xs text-zinc-500 mt-1">Buat folder project baru di dalam Drive.</p>
              </div>
              <div className="p-5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Contoh: Sistem Kasir"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  disabled={creating}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500 disabled:opacity-50 transition-all"
                />
              </div>
              <div className="p-4 bg-zinc-950/50 border-t border-zinc-800/60 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProjectName('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim() || creating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    'Buat Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 border border-zinc-800 border-dashed rounded-xl">
          <FolderOpen className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Belum ada project di folder fooldb.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 transition-colors cursor-pointer"
              onClick={() => onSelectProject(p)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400">
                    <Folder className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">{p.name}</h3>
                    <p className="text-xs text-zinc-500">
                      {new Date(p.modifiedTime).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                  disabled={deletingId === p.id}
                  className="p-1.5 rounded-md hover:bg-red-950/40 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-auto flex items-center justify-between text-xs font-medium text-zinc-500 group-hover:text-zinc-400">
                <span>Klik untuk melihat diagram</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDiagrams({ 
  accessToken, 
  project, 
  onBack 
}: { 
  accessToken: string; 
  project: DriveFile; 
  onBack: () => void;
}) {
  const [diagrams, setDiagrams] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const api = new DriveApi(accessToken);
        const files = await api.getDiagrams(project.id);
        if (mounted) setDiagrams(files);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [accessToken, project.id]);

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`Hapus file "${fileName}"?`)) return;
    setDeletingId(fileId);
    try {
      const api = new DriveApi(accessToken);
      await api.deleteItem(fileId);
      setDiagrams((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      alert('Gagal menghapus file');
    } finally {
      setDeletingId(null);
    }
  };

  const editorUrl = `/editor?projectId=${encodeURIComponent(project.id)}&projectName=${encodeURIComponent(project.name)}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            {project.name}
          </h2>
          <p className="text-xs text-zinc-500">Project Folder</p>
        </div>
        <Link
          href={editorUrl}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Buka di Editor <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
      ) : diagrams.length === 0 ? (
        <div className="text-center py-16 border border-zinc-800 border-dashed rounded-xl">
          <FileCode2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm mb-4">Belum ada diagram tersimpan di project ini.</p>
          <Link
            href={editorUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 text-sm font-medium transition-colors border border-blue-500/20"
          >
            Mulai Buat Diagram
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {diagrams.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 border border-blue-500/20 shrink-0">
                  <img src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000" alt="Code" className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{f.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(f.modifiedTime).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {f.size ? ` · ${Math.round(parseInt(f.size) / 1024)} KB` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Link
                  href={`${editorUrl}&fileId=${f.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:border-blue-500/50 hover:bg-blue-600/10 hover:text-blue-400 text-zinc-300 text-xs font-medium transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Buka
                </Link>
                <button
                  onClick={() => handleDelete(f.id, f.name)}
                  disabled={deletingId === f.id}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-red-800 hover:bg-red-950/30 hover:text-red-400 text-zinc-500 transition-colors disabled:opacity-50"
                  title="Hapus file"
                >
                  {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [selectedProject, setSelectedProject] = useState<DriveFile | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      // If we go back natively, just clear the selected project
      setSelectedProject(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectProject = (proj: DriveFile) => {
    window.history.pushState({ view: 'project', id: proj.id }, '');
    setSelectedProject(proj);
  };

  const handleBackFromProject = () => {
    if (window.history.state?.view === 'project') {
      window.history.back();
    } else {
      setSelectedProject(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" title="Kembali ke Beranda">
            <img src="/fooldb.jpeg" alt="FooIDB Logo" className="w-8 h-8 rounded-md shadow-sm" />
            <span className="font-bold text-zinc-100 hidden sm:block tracking-tight">FooIDB</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/editor"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Buka Editor (Local)
          </Link>
          {session && (
            <button
              onClick={() => {
                if (window.confirm("Apakah Anda yakin ingin keluar dari FooIDB?")) {
                  signOut({ callbackUrl: '/' });
                }
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900/40 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-6 md:py-10">
        
        {/* Breadcrumbs moved below header */}
        {session && (
          <div className="flex items-center gap-2 mb-6 text-sm">
            <span className="text-zinc-400 font-medium cursor-pointer hover:text-zinc-200 transition-colors" onClick={handleBackFromProject}>
              Dashboard
            </span>
            {selectedProject && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-100 font-semibold truncate max-w-[200px]">{selectedProject.name}</span>
              </>
            )}
          </div>
        )}

        {!session ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 mb-6">
              <img src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000" alt="Drive" className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold mb-3">Akses Google Drive</h1>
            <div className="bg-amber-950/30 border border-amber-900/50 text-amber-500 text-sm p-4 rounded-xl mb-8 max-w-md mx-auto text-left flex gap-3 items-start">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
              <p className="leading-relaxed">Sesi akses ke Google Drive Anda mungkin telah berakhir atau belum terhubung. Harap login ulang untuk mulai mengelola diagram.</p>
            </div>
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-500 text-white font-medium transition-all"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
              Masuk dengan Google
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4 mb-8 p-5 rounded-xl border border-zinc-800 bg-zinc-900/60">
              {session.user?.image && (
                <img src={session.user.image} alt={session.user.name || ''} className="w-12 h-12 rounded-full border-2 border-zinc-700" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-zinc-100">{session.user?.name}</p>
                <p className="text-sm text-zinc-500 truncate">{session.user?.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <img src="https://img.icons8.com/?size=100&id=eKDChMKt75eu&format=png&color=000000" alt="Drive" className="w-5 h-5" />
                <span className="text-xs text-zinc-500 hidden sm:inline">Drive Terhubung</span>
              </div>
            </div>

            {selectedProject ? (
              // @ts-expect-error: NextAuth Session lacks accessToken
              <ProjectDiagrams accessToken={session.accessToken as string} project={selectedProject} onBack={handleBackFromProject} />
            ) : (
              // @ts-expect-error: NextAuth Session lacks accessToken
              <ProjectList accessToken={session.accessToken as string} onSelectProject={handleSelectProject} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
