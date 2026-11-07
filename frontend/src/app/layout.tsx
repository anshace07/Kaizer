import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { Sidebar } from "@/components/sidebar";
import { VoiceBar } from "@/components/voice-bar";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PlantPulse AI",
  description: "Voice-first factory incident reporting. All data is synthetic.",
};

// Every page = dark sidebar on the left, page content on the right, footer at the bottom.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex h-full bg-background font-sans text-slate-900">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <VoiceBar />
          <main className="flex-1 px-8 py-6">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
