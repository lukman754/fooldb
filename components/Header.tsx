'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useDbStore, AppMode } from '@/store/dbStore';
import { exportToSvg, exportToPng, downloadFile } from '@/lib/export/exportHelper';
import { generateDrawioXml } from '@/lib/xml/drawioGenerator';
import { generateLrsXml } from '@/lib/xml/lrsGenerator';
import { generateUseCaseXml } from '@/lib/xml/usecaseGenerator';
import { generateActivityXml } from '@/lib/xml/activityGenerator';
import { generateSequenceXml } from '@/lib/xml/sequenceGenerator';
import { validateApiKey } from '@/lib/ai/geminiClient';
import { 
  Database, 
  Upload, 
  Download, 
  FileJson,
  ChevronDown,
  Key
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

export default function Header() {
  const mode = useDbStore((state) => state.mode);
  const setMode = useDbStore((state) => state.setMode);
  const setCode = useDbStore((state) => state.setCode);
  const triggerParse = useDbStore((state) => state.triggerParse);
  
  const layout = useDbStore((state) => state.layout);
  const usecaseDiagram = useDbStore((state) => state.usecaseDiagram);
  const activityDiagram = useDbStore((state) => state.activityDiagram);
  const sequenceDiagram = useDbStore((state) => state.sequenceDiagram);
  const attrPositions = useDbStore((state) => state.attrPositions);
  const relNotation = useDbStore((state) => state.relNotation);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showKeyPopover, setShowKeyPopover] = useState(false);
  const apiKey = useDbStore((state) => state.apiKey);
  const setApiKey = useDbStore((state) => state.setApiKey);
  const initializeStore = useDbStore((state) => state.initializeStore);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initializeStore();
  }, [initializeStore]);

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCode(mode, text);
      triggerParse(mode, text);
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
  } else if (mode === 'activity') {
    activeTemplates = ACTIVITY_TEMPLATES;
    templateLabel = 'Select Activity Template';
  } else if (mode === 'sequence') {
    activeTemplates = SEQUENCE_TEMPLATES;
    templateLabel = 'Select Sequence Template';
  }

  // Check if diagram is generated and can be exported
  let isExportable = false;
  if (mode === 'erd' || mode === 'lrs' || mode === 'transformation') {
    isExportable = layout !== null;
  } else if (mode === 'usecase') {
    isExportable = usecaseDiagram !== null;
  } else if (mode === 'activity') {
    isExportable = activityDiagram !== null;
  } else if (mode === 'sequence') {
    isExportable = sequenceDiagram !== null;
  }

  const handleExport = (format: 'drawio' | 'xml' | 'svg' | 'png') => {
    setShowExportMenu(false);
    
    let xml = '';
    let filenameBase = 'diagram';

    if (mode === 'erd') {
      if (layout) xml = generateDrawioXml(layout, attrPositions, relNotation);
      filenameBase = 'database_erd';
    } else if (mode === 'lrs' || mode === 'transformation') {
      if (layout) xml = generateLrsXml(layout);
      filenameBase = 'database_lrs';
    } else if (mode === 'usecase') {
      if (usecaseDiagram) xml = generateUseCaseXml(usecaseDiagram);
      filenameBase = 'usecase_diagram';
    } else if (mode === 'activity') {
      if (activityDiagram) xml = generateActivityXml(activityDiagram);
      filenameBase = 'activity_diagram';
    } else if (mode === 'sequence') {
      if (sequenceDiagram) xml = generateSequenceXml(sequenceDiagram);
      filenameBase = 'sequence_diagram';
    }

    if (format === 'drawio') {
      if (xml) downloadFile(xml, `${filenameBase}.drawio`, 'application/xml');
    } else if (format === 'xml') {
      if (xml) downloadFile(xml, `${filenameBase}.xml`, 'text/xml');
    } else {
      const svgElement = document.querySelector('#fooldb-svg') as SVGSVGElement;
      if (!svgElement) {
        alert('Diagram SVG element not found in preview page. Please wait for layout to complete.');
        return;
      }
      if (format === 'svg') {
        exportToSvg(svgElement, `${filenameBase}.svg`);
      } else if (format === 'png') {
        exportToPng(svgElement, `${filenameBase}.png`);
      }
    }
  };

  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 z-20">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
          <Database className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5">
            FoolDB
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-800">
              v1.5
            </span>
          </span>
          <span className="text-[10px] font-medium text-zinc-500">
            UML & database suite
          </span>
        </div>
      </div>

      {/* Middle: Mode Tabs */}
      <div className="hidden lg:flex items-center gap-1 bg-zinc-900/50 p-1 border border-zinc-800 rounded-lg">
        {[
          { id: 'erd', label: 'Chen ERD' },
          { id: 'lrs', label: 'LRS Schema' },
          { id: 'transformation', label: 'ERD ➔ LRS' },
          { id: 'usecase', label: 'Use case' },
          { id: 'activity', label: 'Activity' },
          { id: 'sequence', label: 'Sequence' }
        ].map((tab) => {
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id as AppMode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Templates Dropdown */}
        {mode !== 'transformation' && (
          <div className="relative">
            <button
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-850 hover:text-zinc-100"
            >
              <FileJson className="h-3.5 w-3.5 text-blue-500" />
              <span>Templates</span>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </button>
            
            {showTemplateMenu && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setShowTemplateMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-md z-30 animate-in fade-in slide-in-from-top-1 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                    {templateLabel}
                  </div>
                  {activeTemplates.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      onClick={() => selectTemplate(tmpl.code)}
                      className="w-full text-left rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Import Code Button */}
        {mode !== 'transformation' && (
          <button
            onClick={handleImportClick}
            className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Upload className="h-3.5 w-3.5 text-zinc-400" />
            <span>Import</span>
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
            className="flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:bg-zinc-900 disabled:text-zinc-500 disabled:border disabled:border-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
            <ChevronDown className="h-3 w-3 opacity-80" />
          </button>

          {showExportMenu && isExportable && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-md z-30 animate-in fade-in slide-in-from-top-1 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                  Save diagram to
                </div>
                <button
                  onClick={() => handleExport('drawio')}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 flex flex-col"
                >
                  <span className="font-medium text-zinc-200">Draw.io XML (.drawio)</span>
                  <span className="text-[10px] text-zinc-500">Best for diagrams.net import</span>
                </button>
                <button
                  onClick={() => handleExport('xml')}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 flex flex-col"
                >
                  <span className="font-medium text-zinc-200">Standard XML (.xml)</span>
                  <span className="text-[10px] text-zinc-500">Raw schema compatible XML</span>
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                  Image formats
                </div>
                <button
                  onClick={() => handleExport('svg')}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Export Vector SVG
                </button>
                <button
                  onClick={() => handleExport('png')}
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Export Raster PNG
                </button>
              </div>
            </>
          )}
        </div>

        {/* Gemini API Key Popover Settings */}
        <div className="relative">
          <button
            onClick={() => {
              setTempKey(apiKey);
              setValidationError(null);
              setShowKeyPopover(!showKeyPopover);
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
              mounted && apiKey !== ''
                ? 'border-green-600/30 bg-green-950/20 text-green-500'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            title="Set Gemini API Key for Auto-Labeling"
          >
            <Key className="h-4 w-4" />
          </button>

          {showKeyPopover && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowKeyPopover(false)}
              />
              <div className="absolute right-0 mt-1.5 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-md z-30 animate-in fade-in slide-in-from-top-1 duration-100 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Gemini API Key</h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Required for AI relationship analysis. The key is saved locally in your browser cache.
                  </p>
                </div>
                <input
                  type="password"
                  value={tempKey}
                  disabled={isValidating}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="Paste your Gemini API Key..."
                  className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono disabled:opacity-50"
                />
                
                {validationError && (
                  <p className="text-[10px] text-red-500 font-bold leading-tight bg-red-950/20 border border-red-900/30 rounded p-1.5">
                    {validationError}
                  </p>
                )}

                <div className="flex items-center justify-between mt-1">
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-400 hover:underline font-semibold"
                  >
                    Get free key
                  </a>
                  <button
                    onClick={handleSaveKey}
                    disabled={isValidating}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isValidating ? 'Validating...' : 'Save Key'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
