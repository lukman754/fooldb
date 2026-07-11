'use client';

import React, { useEffect, useState, useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SqlEditor from '@/components/editor/SqlEditor';
import TransformationGuide from '@/components/editor/TransformationGuide';
import VisualEditor from '@/components/editor/VisualEditor';
import DrawioPreview from '@/components/preview/DrawioPreview';
import { useDbStore } from '@/store/dbStore';

export default function Home() {
  const triggerParse = useDbStore((state) => state.triggerParse);
  const mode = useDbStore((state) => state.mode);
  const visualSchemaActive = useDbStore((state) => state.visualSchemaActive);
  const [editorWidth, setEditorWidth] = useState(520); // Default editor width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Trigger parsing on initial render to load the default template schema
  useEffect(() => {
    triggerParse();
  }, [triggerParse]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      
      // Keep editor width between 300px and containerWidth - 300px
      const newWidth = Math.max(300, Math.min(e.clientX, containerWidth - 300));
      setEditorWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div ref={containerRef} className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* 1. Header */}
      <Header />
      
      {/* 2. Workspace Layout */}
      <main className="flex-1 flex overflow-hidden w-full relative">
        {/* Left Panel: SQL Monaco Editor or Transformation Guide */}
        <div 
          style={{ width: `${editorWidth}px` }} 
          className="h-full flex flex-col shrink-0 overflow-hidden"
        >
          {mode === 'visual' ? (
            <VisualEditor />
          ) : mode === 'transformation' && !visualSchemaActive ? (
            <TransformationGuide />
          ) : (
            <SqlEditor />
          )}
        </div>
        
        {/* Resizer Divider Bar */}
        <div
          onMouseDown={handleMouseDown}
          className={`group w-[5px] h-full cursor-col-resize shrink-0 transition-colors z-20 flex items-center justify-center relative ${
            isResizing 
              ? 'bg-blue-600' 
              : 'bg-zinc-800 hover:bg-blue-600/50'
          }`}
          title="Drag to resize panels"
        >
          {/* Subtle center indicator */}
          <div className={`w-[1px] h-8 rounded transition-colors ${
            isResizing 
              ? 'bg-white' 
              : 'bg-zinc-700 group-hover:bg-blue-200'
          }`} />
        </div>
        
        {/* Right Panel: Live SVG Preview */}
        <div className="flex-1 h-full flex flex-col overflow-hidden">
          <DrawioPreview />
        </div>
      </main>
      
      {/* 3. Footer */}
      <Footer />
    </div>
  );
}
