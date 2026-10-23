import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Laris — Partner tumbuh usahamu",
  description: "Kelola kasir, stok, resep, pelanggan, tim, dan keuangan usaha F&B dalam satu workspace yang aman.",
  applicationName: "Laris",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={jakarta.variable}>
        <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
        {children}
      </body>
    </html>
  );
}
