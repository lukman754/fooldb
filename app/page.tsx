"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleDashboard = () => {
    if (session) {
      router.push("/dashboard");
    } else {
      signIn("google", { callbackUrl: "/dashboard" });
    }
  };

  return (
    <>
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-surface/10 backdrop-blur-3xl border-b border-white/10 shadow-[0_0_20px_rgba(221,183,255,0.1)]">
        <div className="flex justify-between items-center px-margin-desktop py-4 max-w-container-max mx-auto hidden md:flex">
          {/* Brand */}
          <div className="font-headline-md text-headline-md font-bold text-on-surface tracking-tighter flex items-center gap-2">
            <img src="/Fool.png" alt="FooIDB Logo" className="w-10 h-10 rounded-md shadow-sm" />
            FooIDB
          </div>
          {/* Navigation Links */}
          <ul className="flex items-center gap-8">
            <li>
              <button onClick={handleDashboard} className="text-on-surface/60 font-medium hover:text-primary transition-all duration-300">
                Dashboard
              </button>
            </li>
            <li>
              <Link href="/editor" className="text-on-surface/60 font-medium hover:text-primary transition-all duration-300">
                Editor
              </Link>
            </li>
          </ul>
          {/* Actions */}
          <div className="flex items-center gap-4">
            {session ? (
              <button onClick={() => router.push("/dashboard")} className="bg-primary/90 hover:bg-primary text-on-primary font-label-md px-6 py-2.5 rounded-lg transition-all duration-300 active:scale-95 shadow-glow-primary">
                Open Dashboard
              </button>
            ) : (
              <>
                <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="text-on-surface/60 font-medium hover:text-primary transition-all duration-300 active:scale-95">
                  Log in
                </button>
                <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="bg-primary/90 hover:bg-primary text-on-primary font-label-md px-6 py-2.5 rounded-lg transition-all duration-300 active:scale-95 shadow-glow-primary">
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Nav Fallback (Simple) */}
        <div className="flex justify-between items-center px-margin-mobile py-4 md:hidden">
          <div className="font-headline-md text-headline-md font-bold text-on-surface tracking-tighter flex items-center gap-2">
            <img src="/Fool.png" alt="FooIDB Logo" className="w-10 h-10 rounded-md shadow-sm" />
            FooIDB
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="material-symbols-outlined text-on-surface">
            {isMobileMenuOpen ? "close" : "menu"}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-surface/95 backdrop-blur-3xl border-b border-white/10 shadow-lg px-margin-mobile py-6 flex flex-col gap-6 animate-in slide-in-from-top-2">
            <ul className="flex flex-col gap-4">
              <li>
                <button onClick={() => { setIsMobileMenuOpen(false); handleDashboard(); }} className="text-on-surface/80 font-medium hover:text-primary transition-all text-lg">
                  Dashboard
                </button>
              </li>
              <li>
                <Link href="/editor" onClick={() => setIsMobileMenuOpen(false)} className="text-on-surface/80 font-medium hover:text-primary transition-all text-lg">
                  Editor
                </Link>
              </li>
            </ul>
            <div className="flex flex-col gap-3">
              {session ? (
                <button onClick={() => { setIsMobileMenuOpen(false); router.push("/dashboard"); }} className="bg-primary text-on-primary font-label-md px-6 py-3 rounded-lg text-center font-semibold">
                  Open Dashboard
                </button>
              ) : (
                <>
                  <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="border border-white/20 text-on-surface font-label-md px-6 py-3 rounded-lg font-semibold text-center">
                    Log in
                  </button>
                  <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="bg-primary text-on-primary font-label-md px-6 py-3 rounded-lg font-semibold text-center">
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      <main className="pt-[100px] overflow-x-hidden">
        {/* Hero Section */}
        <section className="relative min-h-[80vh] flex flex-col justify-center items-center px-margin-mobile md:px-margin-desktop py-section-padding max-w-container-max mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Text Content */}
            <div className="flex flex-col gap-8 z-10">
              <h1 className="font-display font-bold text-[2.5rem] leading-[1.1] md:text-[4rem] text-on-surface tracking-tight">
                Generate Diagram <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container">
                  Lebih Cepat
                </span>
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
                Alat web praktis untuk mempercepat pembuatan dan perancangan skema database Anda. Bebas hambatan, simpel, dan dapat diekspor langsung ke Draw.io.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <button onClick={handleDashboard} className="bg-primary text-on-primary font-label-md px-8 py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-primary-fixed transition-all duration-300 active:scale-95 shadow-glow-primary">
                  Start creating
                  <span className="material-symbols-outlined text-[20px]">magic_button</span>
                </button>
              </div>
            </div>

            {/* Visual Content (Glassmorphic Diagram) */}
            <div className="relative w-full aspect-square md:aspect-[4/3] z-10 flex items-center justify-center perspective-[1000px]">
              {/* Base glow for visualization */}
              <div className="absolute inset-0 bg-primary/10 blur-[100px] rounded-full"></div>
              
              {/* Background Tech SVG Pattern */}
              <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
                <svg viewBox="0 0 800 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ddb7ff" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="800" height="600" fill="url(#grid)" />
                  <circle cx="400" cy="300" r="200" fill="none" stroke="#ddb7ff" strokeWidth="2" strokeDasharray="5,5" />
                  <circle cx="400" cy="300" r="150" fill="none" stroke="#b76dff" strokeWidth="1" opacity="0.5" />
                  <path d="M 200 300 L 600 300 M 400 100 L 400 500" stroke="#ddb7ff" strokeWidth="1" strokeDasharray="10,10" opacity="0.3" />
                </svg>
              </div>

              {/* 3D Glass Cards representing Database Tables */}
              <div className="relative w-full h-[300px] md:h-full transform-style-3d rotate-x-[15deg] rotate-y-[-15deg] transition-transform duration-700 hover:rotate-x-[5deg] hover:rotate-y-[-5deg]">
                {/* Main Table Card */}
                <div className="absolute top-[15%] left-[5%] md:left-[10%] w-[75%] md:w-[60%] h-auto glass-panel glass-edge rounded-xl p-5 shadow-glow-primary z-30 transform translate-z-[50px] bg-gradient-to-br from-surface-variant/80 to-surface/40">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <span className="font-label-md text-primary font-bold">Users_Table</span>
                    <span className="material-symbols-outlined text-primary/70 text-[18px]">vpn_key</span>
                  </div>
                  <ul className="space-y-3 font-label-sm text-on-surface-variant pb-2">
                    <li className="flex justify-between">
                      <span className="text-on-surface">id</span> <span className="text-primary/60">UUID</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-on-surface">email</span> <span className="text-primary/60">VARCHAR</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-on-surface">password_hash</span>{" "}
                      <span className="text-primary/60">VARCHAR</span>
                    </li>
                  </ul>
                </div>
                {/* Secondary Table Card */}
                <div className="absolute bottom-[5%] md:bottom-[15%] right-[0%] md:right-[5%] w-[65%] md:w-[50%] h-auto glass-panel glass-edge rounded-xl p-5 shadow-lg z-20 transform translate-z-[20px] bg-surface-container-high/60 backdrop-blur-md">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <span className="font-label-md text-tertiary font-bold">Orders_Table</span>
                    <span className="material-symbols-outlined text-tertiary/70 text-[18px]">shopping_cart</span>
                  </div>
                  <ul className="space-y-2 font-label-sm text-on-surface-variant pb-1">
                    <li className="flex justify-between">
                      <span className="text-on-surface">order_id</span> <span className="text-primary/60">INT</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-on-surface">user_id</span> <span className="text-tertiary/60">FK</span>
                    </li>
                  </ul>
                </div>
                {/* Connection Line */}
                <svg
                  className="absolute inset-0 w-full h-full z-25 pointer-events-none"
                  style={{ transform: "translateZ(35px)" }}
                >
                  <path
                    className="opacity-50"
                    d="M 40% 45% C 60% 45%, 60% 75%, 75% 75%"
                    fill="none"
                    stroke="#ddb7ff"
                    strokeDasharray="4,4"
                    strokeWidth="2"
                  ></path>
                  <circle cx="40%" cy="45%" fill="#ddb7ff" r="4"></circle>
                  <circle cx="75%" cy="75%" fill="#ddb7ff" r="4"></circle>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Section */}
        <section className="py-section-padding px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto relative">
          <div className="spotlight top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">Fitur Lengkap untuk Anda</h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mx-auto">
              Memudahkan konversi, perancangan, dan pengelolaan diagram. Tidak perlu tools berat, semua dari web.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Card 1: ERD */}
            <div className="glass-panel glass-edge rounded-2xl p-8 hover:shadow-glow-primary transition-all duration-500 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] transform translate-x-1/2 -translate-y-1/2 group-hover:bg-primary/20 transition-colors"></div>
              <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center mb-6 border border-white/5">
                <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  schema
                </span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-[24px]">Membuat ERD</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Rancang dan tulis struktur ERD Anda dengan editor sederhana, lalu visualisasikan hasilnya seketika.
              </p>
            </div>
            {/* Card 2: Transform ERD to LRS */}
            <div className="glass-panel glass-edge rounded-2xl p-8 hover:shadow-glow-primary transition-all duration-500 group relative overflow-hidden transform lg:-translate-y-4">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] transform translate-x-1/2 -translate-y-1/2 group-hover:bg-primary/20 transition-colors"></div>
              <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center mb-6 border border-white/5">
                <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  transform
                </span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-[24px]">Transform ERD ke LRS</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Otomatis mengonversi Entity-Relationship Diagram Anda menjadi Logical Record Structure (LRS) dengan satu klik.
              </p>
            </div>
            {/* Card 3: Class Diagram */}
            <div className="glass-panel glass-edge rounded-2xl p-8 hover:shadow-glow-primary transition-all duration-500 group relative overflow-hidden transform lg:-translate-y-4">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] transform translate-x-1/2 -translate-y-1/2 group-hover:bg-primary/20 transition-colors"></div>
              <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center mb-6 border border-white/5">
                <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  account_tree
                </span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-[24px]">Class Diagram</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Visualisasikan sistem berbasis objek dengan cepat, menampilkan class, atribut, operasi, dan relasi.
              </p>
            </div>
            {/* Card 4: Use Case */}
            <div className="glass-panel glass-edge rounded-2xl p-8 hover:shadow-glow-primary transition-all duration-500 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] transform translate-x-1/2 -translate-y-1/2 group-hover:bg-primary/20 transition-colors"></div>
              <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center mb-6 border border-white/5">
                <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  switch_account
                </span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3 text-[24px]">Use Case</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Modelkan interaksi sistem, identifikasi peran user, dan spesifikasikan fungsionalitas dengan mudah.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-background w-full py-section-gap border-t border-outline-variant/30 mt-section-padding">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-container-max mx-auto gap-4 py-6">
          <div className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
            <img src="/Fool.png" alt="FooIDB Logo" className="w-10 h-10 rounded-md shadow-sm grayscale opacity-80" />
            FooIDB
          </div>
          <div className="font-label-sm text-label-sm text-on-surface-variant opacity-80 text-center">
            © {new Date().getFullYear()} FooIDB. Dibuat dengan ☕ oleh{" "}
            <a href="https://github.com/lukman754" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              lukman754
            </a>
            .
          </div>
        </div>
      </footer>
    </>
  );
}