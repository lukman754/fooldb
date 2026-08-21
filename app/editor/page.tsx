'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ModeTabs from '@/components/ModeTabs';
import SqlEditor from '@/components/editor/SqlEditor';
import TransformationGuide from '@/components/editor/TransformationGuide';
import VisualEditor from '@/components/editor/VisualEditor';
import UmlBuilder from '@/components/editor/UmlBuilder';
import ClassEditor from '@/components/editor/ClassEditor';
import DrawioPreview from '@/components/preview/DrawioPreview';
import { useDbStore } from '@/store/dbStore';

function EditorContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const projectName = searchParams.get('projectName');
  const fileId = searchParams.get('fileId');

  const mode = useDbStore((state) => state.mode);
  const visualSchemaActive = useDbStore((state) => state.visualSchemaActive);

  const [editorWidth, setEditorWidth] = useState(520);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let wasMobile = window.innerWidth < 768;
    setIsMobile(wasMobile);
    if (wasMobile) setSidebarOpen(false);

    const check = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (isCurrentlyMobile && !wasMobile) {
        setSidebarOpen(false);
      }
      wasMobile = isCurrentlyMobile;
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const initializeStore = useDbStore((state) => state.initializeStore);
  useEffect(() => { initializeStore(projectId); }, [initializeStore, projectId]);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [mode, isMobile]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const newWidth = Math.max(280, Math.min(e.clientX, containerWidth - 300));
      setEditorWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const renderSidebarContent = () => {
    if (mode === 'visual') return <VisualEditor />;
    if (mode === 'uml') return <UmlBuilder />;
    if (mode === 'class') return <ClassEditor />;
    if (mode === 'transformation' && !visualSchemaActive) return <TransformationGuide />;
    return <SqlEditor />;
  };

  const desktopSidebarStyle: React.CSSProperties = isMobile
    ? {}
    : { width: sidebarOpen ? `${editorWidth}px` : '0px', transition: 'width 300ms ease-in-out' };

  return (
    <div
      ref={containerRef}
      className="flex h-dvh w-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden"
    >
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        projectId={projectId}
        projectName={projectName}
        fileId={fileId}
      />

      <main className="flex-1 flex overflow-hidden w-full relative">
        {/* Left sidebar */}
        <div
          className={`
            h-full flex flex-col shrink-0 overflow-hidden z-30 bg-zinc-950
            md:transition-[width] md:duration-300 md:ease-in-out
            max-md:absolute max-md:left-0 max-md:top-0 max-md:h-full
            max-md:shadow-2xl max-md:border-r max-md:border-zinc-800
            max-md:transition-[width] max-md:duration-300 max-md:ease-in-out
            ${isMobile
              ? sidebarOpen
                ? 'w-[85vw] max-w-[360px]'
                : 'w-0'
              : ''
            }
          `}
          style={desktopSidebarStyle}
        >
          <div className="h-full w-full overflow-hidden flex flex-col">
            {renderSidebarContent()}
          </div>
        </div>

        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {!isMobile && sidebarOpen && (
          <div
            onMouseDown={handleMouseDown}
            className={`flex w-[5px] h-full cursor-col-resize shrink-0 transition-colors z-20 items-center justify-center ${
              isResizing ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-blue-600/50'
            }`}
            title="Drag to resize panels"
          >
            <div className={`w-[1px] h-8 rounded transition-colors ${
              isResizing ? 'bg-white' : 'bg-zinc-700 hover:bg-blue-200'
            }`} />
          </div>
        )}

        <div className="flex-1 h-full flex flex-col overflow-hidden">
          <DrawioPreview />
        </div>
      </main>

      <ModeTabs />
      <Footer />
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="h-dvh w-full bg-zinc-950 flex items-center justify-center text-zinc-400">Loading editor...</div>}>
      <EditorContent />
    </Suspense>
  );
}
