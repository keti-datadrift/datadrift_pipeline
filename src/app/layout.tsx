import "./globals.css";
export const metadata = {
  title: "DataDrift · 속성추출",
  description: "DataOps · MLOps workspace",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
