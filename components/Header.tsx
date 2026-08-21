'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useDbStore, AppMode } from '@/store/dbStore';
import { exportToSvg, exportToPng, downloadFile } from '@/lib/export/exportHelper';
import { generateDrawioXml } from '@/lib/xml/drawioGenerator';
import { generateLrsXml } from '@/lib/xml/lrsGenerator';
import { generateTransformationXml } from '@/lib/xml/transformationGenerator';
import { generateUseCaseXml } from '@/lib/xml/usecaseGenerator';
import { generateClassXml } from '@/lib/xml/classGenerator';
import { validateApiKey } from '@/lib/ai/geminiClient';
import { DriveMenu, DriveMenuRef } from '@/components/DriveMenu';
import { 
  Database, 
  Upload, 
  Download, 
  FileJson,
  ChevronDown,
  Key,
  PanelLeftClose,
  PanelLeft,
  LayoutGrid,
  X,
  RotateCcw,
} from 'lucide-react';

const SQL_TEMPLATES = [
  {
    name: 'E-commerce SQL Schema',
    code: `-- FoolDB E-commerce Sample Schema
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role ENUM('customer', 'admin', 'moderator') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id INT NULL,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  stock_quantity INT NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  status ENUM('pending', 'paid', 'shipped', 'cancelled') DEFAULT 'pending',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
`
  },
  {
    name: 'WordPress Simplified SQL',
    code: `-- WordPress Simplified Schema
CREATE TABLE wp_users (
  ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_login varchar(60) NOT NULL DEFAULT '',
  user_pass varchar(255) NOT NULL DEFAULT '',
  user_email varchar(100) NOT NULL DEFAULT '',
  display_name varchar(250) NOT NULL DEFAULT '',
  PRIMARY KEY (ID)
);

CREATE TABLE wp_posts (
  ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  post_author bigint(20) unsigned NOT NULL DEFAULT '0',
  post_content longtext NOT NULL,
  post_title text NOT NULL,
  post_status varchar(20) NOT NULL DEFAULT 'publish',
  PRIMARY KEY (ID),
  FOREIGN KEY (post_author) REFERENCES wp_users(ID)
);

CREATE TABLE wp_comments (
  comment_ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  comment_post_ID bigint(20) unsigned NOT NULL DEFAULT '0',
  comment_author tinytext NOT NULL,
  comment_content text NOT NULL,
  PRIMARY KEY (comment_ID),
  FOREIGN KEY (comment_post_ID) REFERENCES wp_posts(ID)
);
`
  }
];

const USECASE_TEMPLATES = [
  {
    name: 'E-commerce Use Case',
    code: `# E-commerce Use Case Diagram
actor Customer
actor Admin

system "E-commerce System"
usecase "Browse Products"
usecase "Manage Cart"
usecase "Checkout Order"
usecase "Manage Catalog"
usecase "Process Shipments"

Customer -> Browse Products
Customer -> Manage Cart
Customer -> Checkout Order
Admin -> Manage Catalog
Admin -> Process Shipments
`
  },
  {
    name: 'Hospital Management Use Case',
    code: `# Hospital Management Use Case
actor Patient
actor Doctor
actor Receptionist

system "Hospital Management Portal"
usecase "Register Patient"
usecase "Schedule Appointment"
usecase "Diagnose Disease"
usecase "Prescribe Medication"
usecase "Discharge Patient"

Receptionist -> Register Patient
Patient -> Schedule Appointment
Receptionist -> Schedule Appointment
Doctor -> Diagnose Disease
Doctor -> Prescribe Medication
Doctor -> Discharge Patient
`
  }
];

const ACTIVITY_TEMPLATES = [
  {
    name: 'Order Process Activity Flow',
    code: `# Order Process Activity Flow
start
action checkout "Validate Checkout Cart"
decision check_stock "Are items in stock?"
action adjust_stock "Reduce inventory & create invoice"
action error_msg "Show Out-of-Stock error page"
end

start -> checkout
checkout -> check_stock
check_stock -> adjust_stock : yes
check_stock -> error_msg : no
adjust_stock -> end
error_msg -> end
`
  },
  {
    name: 'User Registration Flow',
    code: `# User Registration Flow
start
action fill_form "Fill in Registration Form"
decision check_email "Is Email unique?"
action send_verification "Send email verification link"
action show_error "Show Email Already Registered Error"
end

start -> fill_form
fill_form -> check_email
check_email -> send_verification : yes
check_email -> show_error : no
send_verification -> end
show_error -> fill_form
`
  }
];

const SEQUENCE_TEMPLATES = [
  {
    name: 'User Login Sequence',
    code: `# User Login Sequence
object Customer "Customer User"
object Browser "Client Browser"
object Server "Web API Server"
object DB "MySQL Database"

Customer -> Browser : Fill credentials & click login
Browser -> Server : POST /api/login (user, pass)
Server -> DB : SELECT FROM users WHERE username
DB -> Server : Returns user record & hashed pass
Server -> Browser : Return JWT Token (200 OK)
Browser -> Customer : Display Dashboard Welcome
`
  },
  {
    name: 'Password Reset Sequence',
    code: `# Password Reset Sequence
object User "User Client"
object WebPortal "Web Portal"
object AuthAPI "Auth API Service"
object MailServer "SMTP Mail Server"

User -> WebPortal : Clicks Forgot Password
WebPortal -> AuthAPI : POST /api/forgot-password (email)
AuthAPI -> MailServer : Send Password Reset Token
MailServer -> User : Delivers Password Reset Email
User -> WebPortal : Clicks Link & Enters New Password
WebPortal -> AuthAPI : POST /api/reset-password (token, password)
AuthAPI -> User : Password Updated Successfully
`
  }
];


interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  projectId?: string | null;
  projectName?: string | null;
  fileId?: string | null;
}

export default function Header({ sidebarOpen, onToggleSidebar, projectId, projectName, fileId }: HeaderProps) {
  const mode = useDbStore((state) => state.mode);
  const sqlCode = useDbStore((state) => state.sqlCode);
  const usecaseCode = useDbStore((state) => state.usecaseCode);
  const setMode = useDbStore((state) => state.setMode);
  const setCode = useDbStore((state) => state.setCode);
  const triggerParse = useDbStore((state) => state.triggerParse);
  
  const layout = useDbStore((state) => state.layout);
  const usecaseDiagram = useDbStore((state) => state.usecaseDiagram);
  const attrPositions = useDbStore((state) => state.attrPositions);
  const relNotation = useDbStore((state) => state.relNotation);
  const lrsKeyNotation = useDbStore((state) => state.lrsKeyNotation);
  const classMethods = useDbStore((state) => state.classMethods);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const driveMenuRef = useRef<DriveMenuRef>(null);
  
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showKeyPopover, setShowKeyPopover] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const apiKey = useDbStore((state) => state.apiKey);
  const setApiKey = useDbStore((state) => state.setApiKey);
  const initializeStore = useDbStore((state) => state.initializeStore);
  const clearCache = useDbStore((state) => state.clearCache);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initializeStore(projectId);
  }, [initializeStore, projectId]);

  // Auto-save every 5 minutes to Drive
  useEffect(() => {
    const interval = setInterval(() => {
      driveMenuRef.current?.triggerSave();
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTempKey(apiKey);
  }, [apiKey]);

  const handleSaveKey = async () => {
    if (!tempKey.trim()) {
      setValidationError('API Key cannot be empty.');
      return;
    }
    setIsValidating(true);
    setValidationError(null);
    const errorMsg = await validateApiKey(tempKey);
    setIsValidating(false);
    if (!errorMsg) {
      setApiKey(tempKey);
      setValidationError(null);
      setShowKeyPopover(false);
    } else {
      setValidationError(errorMsg);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCode(mode, text);
      triggerParse(mode, text);
      
      // Auto-save to Drive after importing
      setTimeout(() => {
        driveMenuRef.current?.triggerSave();
      }, 1000);
    };
    reader.readAsText(file);
  };

  const selectTemplate = (code: string) => {
    setCode(mode, code);
    triggerParse(mode, code);
    setShowTemplateMenu(false);
  };

  // Retrieve current active templates based on active mode
  let activeTemplates = SQL_TEMPLATES;
  let templateLabel = 'Select SQL Template';
  if (mode === 'usecase') {
    activeTemplates = USECASE_TEMPLATES;
    templateLabel = 'Select Use Case Template';
  }

  // Check if diagram is generated and can be exported
  let isExportable = false;
  if (mode === 'erd' || mode === 'lrs' || mode === 'transformation' || mode === 'visual' || mode === 'class') {
    isExportable = layout !== null;
  } else if (mode === 'usecase' || mode === 'uml') {
    isExportable = usecaseDiagram !== null;
  }

  const handleExport = (format: 'drawio' | 'xml' | 'svg' | 'png') => {
    setShowExportMenu(false);
    let xml = '';
    let filenameBase = 'diagram';

    if (mode === 'erd' || mode === 'visual') {
      if (layout) xml = generateDrawioXml(layout, attrPositions, relNotation);
      filenameBase = mode === 'visual' ? 'visual_erd' : 'database_erd';
    } else if (mode === 'lrs') {
      if (layout) xml = generateLrsXml(layout, lrsKeyNotation);
      filenameBase = 'database_lrs';
    } else if (mode === 'transformation') {
      if (layout) xml = generateTransformationXml(layout, lrsKeyNotation);
      filenameBase = 'database_transformation';
    } else if (mode === 'class') {
      if (layout) xml = generateClassXml(layout, classMethods, relNotation);
      filenameBase = 'database_class';
    } else if (mode === 'usecase') {
      if (usecaseDiagram) xml = generateUseCaseXml(usecaseDiagram);
      filenameBase = 'usecase_diagram';
    }

    if (format === 'drawio') {
      if (xml) downloadFile(xml, `${filenameBase}.drawio`, 'application/xml');
    } else if (format === 'xml') {
      if (xml) downloadFile(xml, `${filenameBase}.xml`, 'text/xml');
    } else {
      const svgElement = document.querySelector('#fooldb-svg') as SVGSVGElement;
      if (!svgElement) {
        alert('Diagram SVG element not found. Please wait for layout to complete.');
        return;
      }
      if (format === 'svg') {
        exportToSvg(svgElement, `${filenameBase}.svg`);
      } else if (format === 'png') {
        exportToPng(svgElement, `${filenameBase}.png`);
      }
    }
  };

  const getCurrentXml = () => {
    let xml = '';
    if (mode === 'erd' || mode === 'visual') {
      if (layout) xml = generateDrawioXml(layout, attrPositions, relNotation);
    } else if (mode === 'lrs') {
      if (layout) xml = generateLrsXml(layout, lrsKeyNotation);
    } else if (mode === 'transformation') {
      if (layout) xml = generateTransformationXml(layout, lrsKeyNotation);
    } else if (mode === 'class') {
      if (layout) xml = generateClassXml(layout, classMethods, relNotation);
    } else if (mode === 'usecase') {
      if (usecaseDiagram) xml = generateUseCaseXml(usecaseDiagram);
    }
    return xml;
  };

  const handleDriveLoad = (xml: string) => {
    // Determine the current mode or just blindly try to parse it. 
    // Ideally we should determine mode from the file contents, but for now we'll just set it and parse it.
    setCode(mode, xml);
    triggerParse(mode, xml);
  };

  const showTemplateBtn = mode !== 'transformation' && mode !== 'visual';

  const showImportBtn = mode !== 'transformation' && mode !== 'visual';

  return (
    <header className="flex items-center w-full h-12 border-b border-zinc-800 bg-zinc-950 px-2 z-20 shrink-0 gap-2">
      
      {/* Left section */}
      <div className="flex items-center gap-3 w-1/3">
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition shrink-0"
          title="Toggle Left Sidebar"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity" title="Return to Dashboard">
            <img src="/Fool.png" alt="FooIDB Logo" className="w-7 h-7 rounded-md shadow-sm shrink-0" />
            <span className="font-bold text-zinc-100 text-sm hidden sm:block tracking-tight">FooIDB</span>
          </Link>
        </div>
        
        {projectName && (
          <>
            <span className="text-zinc-700 hidden sm:block">/</span>
            <span className="text-xs text-zinc-300 font-medium hidden sm:block truncate max-w-[120px] bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right Controls */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Templates Dropdown */}
        {showTemplateBtn && (
          <div className="relative">
            <button
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 whitespace-nowrap"
            >
              <FileJson className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="hidden lg:inline">Templates</span>
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            
            {showTemplateMenu && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setShowTemplateMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl z-30">
                  <div className="px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                    {templateLabel}
                  </div>
                  {activeTemplates.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      onClick={() => selectTemplate(tmpl.code)}
                      className="w-full text-left rounded-md px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Import Button */}
        {showImportBtn && (
          <button
            onClick={handleImportClick}
            className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Import</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={mode === 'erd' || mode === 'lrs' ? '.sql,.txt' : '.txt,.md'}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={!isExportable}
            className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white transition hover:bg-blue-500 whitespace-nowrap disabled:bg-zinc-900 disabled:text-zinc-500 disabled:border disabled:border-zinc-800"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className="h-3 w-3 opacity-80 hidden sm:inline" />
          </button>

          {showExportMenu && isExportable && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl z-30">
                <div className="px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                  Save diagram as
                </div>
                <button
                  onClick={() => handleExport('drawio')}
                  className="w-full text-left rounded-md px-2.5 py-2 text-xs transition hover:bg-zinc-800 flex flex-col gap-0.5"
                >
                  <span className="font-medium text-zinc-200">Draw.io XML (.drawio)</span>
                  <span className="text-[10px] text-zinc-500">Best for diagrams.net import</span>
                </button>
                <button
                  onClick={() => handleExport('xml')}
                  className="w-full text-left rounded-md px-2.5 py-2 text-xs transition hover:bg-zinc-800 flex flex-col gap-0.5"
                >
                  <span className="font-medium text-zinc-200">Standard XML (.xml)</span>
                  <span className="text-[10px] text-zinc-500">Raw schema compatible XML</span>
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <div className="px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                  Image
                </div>
                <button
                  onClick={() => handleExport('svg')}
                  className="w-full text-left rounded-md px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Export Vector SVG
                </button>
                <button
                  onClick={() => handleExport('png')}
                  className="w-full text-left rounded-md px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Export Raster PNG
                </button>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-zinc-800 shrink-0 mx-0.5" />

        {/* Drive Menu — compact icon-based version integrated in header */}
        <DriveMenu 
          ref={driveMenuRef}
          getCurrentXml={() => mode === 'usecase' ? usecaseCode : sqlCode} 
          onLoadXml={handleDriveLoad} 
          fileName={projectName ? `${projectName}-${mode}.txt` : `${mode}_diagram.txt`} 
          projectId={projectId}
          fileId={fileId}
        />

        {/* Divider */}
        <div className="w-px h-6 bg-zinc-800 shrink-0 mx-0.5" />

        {/* Gemini API Key */}
        <div className="relative">
          <button
            onClick={() => {
              setTempKey(apiKey);
              setValidationError(null);
              setShowKeyPopover(!showKeyPopover);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition shrink-0 ${
              mounted && apiKey !== ''
                ? 'border-green-600/30 bg-green-950/20 text-green-500'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title="Set Gemini API Key for AI auto-labeling"
          >
            <Key className="h-3.5 w-3.5" />
          </button>

          {showKeyPopover && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowKeyPopover(false)}
              />
              <div className="absolute right-0 mt-1.5 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-xl z-30 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-semibold text-zinc-200">Gemini API Key</h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Required for AI relationship analysis. Saved locally in your browser.
                  </p>
                </div>
                <input
                  type="password"
                  value={tempKey}
                  disabled={isValidating}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="Paste your Gemini API Key..."
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 font-mono disabled:opacity-50"
                />
                
                {validationError && (
                  <p className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/30 rounded p-2 leading-tight">
                    {validationError}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-400 hover:underline font-medium"
                  >
                    Get free key →
                  </a>
                  <button
                    onClick={handleSaveKey}
                    disabled={isValidating}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isValidating ? 'Validating...' : 'Save Key'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Reset / Clear Button */}
        <button
          onClick={() => {
            const ok = window.confirm("Are you sure you want to reset all diagrams and clear cached inputs? This will restore default schemas.");
            if (ok) clearCache();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors shrink-0"
          title="Reset all diagrams and clear local storage cache"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

