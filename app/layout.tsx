import "./globals.css";
import { Inter } from "next/font/google";

// Load the Inter font
const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Bench Tracker",
  description: "Class Council Attendance & Task Verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}