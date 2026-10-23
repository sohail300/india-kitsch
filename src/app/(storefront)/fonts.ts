import localFont from "next/font/local";

// Self-hosted (the CSP only allows font-src 'self').
export const inter = localFont({
  variable: "--sf-font-inter",
  display: "swap",
  src: [
    { path: "./_fonts/inter_n4.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/inter_i4.woff2", weight: "400", style: "italic" },
    { path: "./_fonts/inter_n5.woff2", weight: "500", style: "normal" },
    { path: "./_fonts/inter_i5.woff2", weight: "500", style: "italic" },
    { path: "./_fonts/inter_n6.woff2", weight: "600", style: "normal" },
    { path: "./_fonts/inter_n7.woff2", weight: "700", style: "normal" },
    { path: "./_fonts/inter_i7.woff2", weight: "700", style: "italic" },
  ],
});

export const cormorant = localFont({
  variable: "--sf-font-cormorant",
  display: "swap",
  src: [
    { path: "./_fonts/cormorant_n4.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/cormorant_i4.woff2", weight: "400", style: "italic" },
    { path: "./_fonts/cormorant_n5.woff2", weight: "500", style: "normal" },
    { path: "./_fonts/cormorant_n7.woff2", weight: "700", style: "normal" },
    { path: "./_fonts/cormorant_i7.woff2", weight: "700", style: "italic" },
  ],
});
