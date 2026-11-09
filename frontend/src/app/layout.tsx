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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-screen bg-background font-sans text-slate-900">
        <div className="flex min-h-screen w-full">
          <Sidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <AlarmWatcher />

            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
              {children}
            </main>

            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}