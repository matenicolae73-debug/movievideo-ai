import type { Metadata } from "next"; import "./globals.css";
export const metadata:Metadata={title:"ViralMovie API",description:"Real AI video generation API"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}