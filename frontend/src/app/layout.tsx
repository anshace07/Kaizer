import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AlarmWatcher } from "@/components/alarm-watcher";
import { Footer } from "@/components/footer";
import { Sidebar } from "@/components/sidebar";


const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KAIZER",
 description: "Voice-first industrial incident reporting and management.",
};

// Every page = dark sidebar on the left, page content on the right, footer at the bottom.
// Content width is capped so it stays sharp and balanced in a 1920x1080 screen recording.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex h-full bg-background font-sans text-slate-900">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          
          <AlarmWatcher />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-10 py-8">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
