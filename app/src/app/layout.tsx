import type { Metadata } from "next";
import { Playfair_Display, Instrument_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentProfile } from "@/lib/data/profile";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1501 Learn: Data & Analytics Engineering Bootcamp",
  description:
    "A cohort-based Data & Analytics Engineering Bootcamp platform: courses, progress tracking, quizzes, assignments and instructor feedback.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();
  const theme = profile?.theme ?? "light";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${playfairDisplay.variable} ${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
