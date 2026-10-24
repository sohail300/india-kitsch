// Placeholder content for the static storefront UI: copy and photos borrowed
// from the Sansevieria site (sibling brand) until India Kitsch's own content
// and the catalog backend are wired in. Contact details are dummies.
import type { HomeContent, Shell } from "../_lib/content";
import img17 from "./media/images/Diwali_Courtyard_Celebration.webp";
import img18 from "./media/images/ChatGPT_Image_Aug_8_2026_01_18_19_PM_1.webp";
import img19 from "./media/images/ChatGPT_Image_Aug_6_2026_11_20_37_PM.webp";
import img20 from "./media/images/ChatGPT_Image_Aug_6_2026_10_21_21_PM.webp";
import img21 from "./media/images/ChatGPT_Image_Aug_8_2026_01_18_20_PM_2.webp";
import img22 from "./media/images/Made_for_Diwali__Festive_Edit.webp";
import img23 from "./media/images/ChatGPT_Image_Jun_7_2026_05_07_47_PM.webp";
import img24 from "./media/images/ChatGPT_Image_Jun_7_2026_10_51_25_PM.webp";
import img25 from "./media/posters/33a29a11604d45e2a70efa82aeac2bfe.thumbnail.0000000000.webp";
import img26 from "./media/posters/e8f0befd3a1e4bb5bf36765e3c33ec9f.thumbnail.0000000000.webp";
import img27 from "./media/posters/386e25d951e348efa8c1c7e95c248522.thumbnail.0000000000.webp";
import img28 from "./media/images/ChatGPT_Image_Jul_30_2026_06_59_39_PM.webp";
import img29 from "./media/images/sv-payment-upi.svg";
import img30 from "./media/images/sv-payment-rupay.svg";

export const shell: Shell = {
  announcement: {
    heading: "DIWALI OFFERS END 31 OCT",
    endsAt: "2026-10-31T23:59:59+05:30",
    ticker: [
      "🪔 THE DIWALI EDIT",
      "Buy Any 2 Shirts & Save ₹410",
      "Buy Any 3 Shirts & Save ₹710",
      "FLAT 15% OFF on Orders Above ₹6,000",
    ],
  },
  header: {
    logo: null,
    hindiLogo: "इंडिया किच",
    caption: "Natural fabrics · Thoughtful embroidery",
    nav: [
      {
        label: "Home",
        href: "/",
        highlight: false,
      },
      {
        label: "Shop All",
        href: "/shop",
        highlight: false,
      },
      {
        label: "Diwali Edit",
        href: "/collections/diwali-shirts-for-women",
        highlight: true,
      },
      {
        label: "Cotton",
        href: null,
        children: [
          {
            label: "View all Cotton",
            href: "/collections/cotton-embroidered-shirt-for-women",
          },
          {
            label: "Wildflower",
            href: "/collections/wildflower-embroidered-cotton-shirts-for-women",
          },
          {
            label: "Medallion",
            href: "/collections/womens-medallion-embroidered-cotton-shirts",
          },
          {
            label: "Artisan",
            href: "/collections/artisan-embroidered-cotton-shirt",
          },
          {
            label: "Collar Floral",
            href: "/collections/collar-floral-embroidered-cotton-shirt",
          },
          {
            label: "Floral",
            href: "/collections/floral-embroidered-cotton-shirt",
          },
          {
            label: "Landscape",
            href: "/collections/landscape-embroidered-cotton-shirt",
          },
        ],
      },
      {
        label: "Linen",
        href: null,
        children: [
          {
            label: "View all Linen",
            href: "/collections/linen-embroidered-shirt-for-women",
          },
          {
            label: "Back Embroidered",
            href: "/collections/back-embroidered-linen-shirt",
          },
        ],
      },
      {
        label: "Best Seller",
        href: "/collections/best-sellers",
        highlight: false,
      },
      {
        label: "New Arrival",
        href: "/collections/new-arrivals",
        highlight: false,
      },
      {
        label: "Our Signature Designs",
        href: "/collections/our-signature-designs",
        highlight: false,
      },
      {
        label: "Blogs",
        href: "/blog",
        highlight: false,
      },
      {
        label: "Our Story",
        href: "/about",
        highlight: false,
      },
    ],
    actions: {
      search: "/search",
      wishlist: "/wishlist",
      cart: "/cart",
      tracking: "https://www.ithinklogistics.co.in/",
      account: "/account",
    },
    drawer: {
      eyebrow: "Menu",
      subtitle: "Explore India Kitsch",
      searchPlaceholder: "Search products",
      sectionLabels: ["Shop", "Account & Support"],
      support: [
        {
          title: "My Account",
          subtitle: "Orders, returns & profile",
          href: "/account",
        },
        {
          title: "Track Order",
          subtitle: "Check delivery status",
          href: "https://www.ithinklogistics.co.in/",
        },
      ],
      submenus: [
        {
          label: "Cotton",
          sectionLabel: "Browse Cotton",
          viewAll: {
            title: "Shop all Cotton",
            subtitle: "View the complete Cotton collection",
            href: "/collections/cotton-embroidered-shirt-for-women",
          },
          items: [
            {
              title: "Wildflower",
              subtitle: "Free size Best fit S · M · L",
              href: "/collections/wildflower-embroidered-cotton-shirts-for-women",
            },
            {
              title: "Medallion",
              subtitle: "Free size Best fit S · M · L",
              href: "/collections/womens-medallion-embroidered-cotton-shirts",
            },
            {
              title: "Artisan",
              subtitle: "Free size Best fit S · M · L",
              href: "/collections/artisan-embroidered-cotton-shirt",
            },
            {
              title: "Collar Floral",
              subtitle: "Free size Best fit S · M · L",
              href: "/collections/collar-floral-embroidered-cotton-shirt",
            },
            {
              title: "Floral",
              subtitle: "Free size Best fit S · M · L",
              href: "/collections/floral-embroidered-cotton-shirt",
            },
            {
              title: "Landscape",
              subtitle: "Free size Best fit XS · S",
              href: "/collections/landscape-embroidered-cotton-shirt",
            },
          ],
        },
        {
          label: "Linen",
          sectionLabel: "Browse Linen",
          viewAll: {
            title: "Shop all Linen",
            subtitle: "View the complete Linen collection",
            href: "/collections/linen-embroidered-shirt-for-women",
          },
          items: [
            {
              title: "Back Embroidered",
              subtitle: "Free size Best fit M · L · XL",
              href: "/collections/back-embroidered-linen-shirt",
            },
          ],
        },
      ],
    },
  },
  footer: {
    eyebrow: "The India Kitsch point of view",
    heading: "Made with intention. Worn with confidence.",
    cta: {
      label: "Explore the collection",
      href: "/shop",
    },
    logo: null,
    follow: {
      eyebrow: "Follow the thread",
      heading: "Follow us on Instagram and Facebook",
      html: "<p>See embroidery up close, styling ideas, new launches and the stories behind each design.</p>",
      links: [
        {
          href: "#",
          network: "instagram",
          lines: ["Instagram", "Follow on Instagram"],
        },
        {
          href: "#",
          network: "facebook",
          lines: ["Facebook", "Follow on Facebook"],
        },
      ],
    },
    columns: [
      {
        heading: "Shop",
        type: "links",
        links: [
          {
            label: "Cotton",
            href: "/collections/cotton-embroidered-shirt-for-women",
          },
          {
            label: "Linen",
            href: "/collections/linen-embroidered-shirt-for-women",
          },
          {
            label: "Shop All",
            href: "/shop",
          },
          {
            label: "Best Sellers",
            href: "/collections/best-sellers",
          },
        ],
      },
      {
        heading: "Information",
        type: "links",
        links: [
          {
            label: "Shipping & Delivery",
            href: "/policies/shipping-policy",
          },
          {
            label: "Return & Refund",
            href: "/policies/refund-policy",
          },
          {
            label: "FAQ",
            href: "/faq",
          },
          {
            label: "Contact Us",
            href: "/contact",
          },
        ],
      },
      {
        heading: "Contact us",
        type: "contact",
        links: [
          {
            href: "mailto:hello@example.com",
            parts: ["Email", "hello@example.com"],
          },
          {
            href: "#",
            parts: ["Call", "+91 00000 00000"],
          },
          {
            href: "#",
            parts: ["WhatsApp", "Chat with us"],
          },
        ],
        static: ["Hours", "10 AM–5 PM · Monday–Saturday"],
      },
      {
        heading: "Business address",
        type: "html",
        html: "<p>Business address to be added</p>",
      },
    ],
    payments: {
      label: "Secure payments",
      cards: [
        {
          name: "upi",
          image: {
            src: img29,
            alt: "UPI",
            width: null,
            height: null,
          },
          svg: null,
        },
        {
          name: "visa",
          image: null,
          svg: '<svg class="sv-footer__payment-icon sv-footer__payment-icon--visa" xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 38 24" width="38" height="24" fill="none" aria-labelledby="pi-visa"><title id="pi-visa">Visa</title><rect x=".5" y=".5" width="37" height="23" rx="2.5" stroke="#000" stroke-opacity=".07" fill="none"></rect><path d="M35 0H3C1.3 0 0 1.3 0 3V21C0 22.7 1.4 24 3 24H35C36.7 24 38 22.7 38 21V3C38 1.3 36.6 0 35 0Z" fill="#142FBD" style="fill:#142FBD;fill:color(display-p3 0.0784 0.1843 0.7412);fill-opacity:1;"></path><path d="M35 1C36.1 1 37 1.9 37 3V21C37 22.1 36.1 23 35 23H3C1.9 23 1 22.1 1 21V3C1 1.9 1.9 1 3 1H35Z" fill="#1532CB" style="fill:#1532CB;fill:color(display-p3 0.0824 0.1961 0.7961);fill-opacity:1;"></path><path d="M29.5944 10.2167H29.2778C28.8556 11.2722 28.5389 11.8 28.2222 13.3833H30.2278C29.9111 11.8 29.9111 11.0611 29.5944 10.2167V10.2167ZM32.6556 16.4444H30.8611C30.7556 16.4444 30.7556 16.4444 30.65 16.3389L30.4389 15.3889L30.3333 15.1778H27.8C27.6944 15.1778 27.5889 15.1778 27.5889 15.3889L27.2722 16.3389C27.2722 16.4444 27.1667 16.4444 27.1667 16.4444H24.95L25.1611 15.9167L28.2222 8.73889C28.2222 8.21111 28.5389 8 29.0667 8H30.65C30.7556 8 30.8611 8 30.8611 8.21111L32.3389 15.0722C32.4444 15.4944 32.55 15.8111 32.55 16.2333C32.6556 16.3389 32.6556 16.3389 32.6556 16.4444V16.4444ZM18.5111 16.1278L18.9333 14.2278C19.0389 14.2278 19.1444 14.3333 19.1444 14.3333C19.8833 14.65 20.6222 14.8611 21.3611 14.7556C21.5722 14.7556 21.8889 14.65 22.1 14.5444C22.6278 14.3333 22.6278 13.8056 22.2056 13.3833C21.9944 13.1722 21.6778 13.0667 21.3611 12.8556C20.9389 12.6444 20.5167 12.4333 20.2 12.1167C18.9333 11.0611 19.3556 9.58333 20.0944 8.84444C20.7278 8.42222 21.0444 8 21.8889 8C23.1556 8 24.5278 8 25.1611 8.21111H25.2667C25.1611 8.84444 25.0556 9.37222 24.8444 10.0056C24.3167 9.79444 23.7889 9.58333 23.2611 9.58333C22.9444 9.58333 22.6278 9.58333 22.3111 9.68889C22.1 9.68889 21.9944 9.79444 21.8889 9.9C21.6778 10.1111 21.6778 10.4278 21.8889 10.6389L22.4167 11.0611C22.8389 11.2722 23.2611 11.4833 23.5778 11.6944C24.1056 12.0111 24.6333 12.5389 24.7389 13.1722C24.95 14.1222 24.6333 14.9667 23.7889 15.6C23.2611 16.0222 23.05 16.2333 22.3111 16.2333C20.8333 16.2333 19.6722 16.3389 18.7222 16.0222C18.6167 16.2333 18.6167 16.2333 18.5111 16.1278V16.1278ZM14.8167 16.4444C14.9222 15.7056 14.9222 15.7056 15.0278 15.3889C15.5556 13.0667 16.0833 10.6389 16.5056 8.31667C16.6111 8.10556 16.6111 8 16.8222 8H18.7222C18.5111 9.26667 18.3 10.2167 17.9833 11.3778C17.6667 12.9611 17.35 14.5444 16.9278 16.1278C16.9278 16.3389 16.8222 16.3389 16.6111 16.3389L14.8167 16.4444ZM5 8.21111C5 8.10556 5.21111 8 5.31667 8H8.90556C9.43333 8 9.85556 8.31667 9.96111 8.84444L10.9111 13.4889C10.9111 13.5944 10.9111 13.5944 11.0167 13.7C11.0167 13.5944 11.1222 13.5944 11.1222 13.5944L13.3389 8.21111C13.2333 8.10556 13.3389 8 13.4444 8H15.6611C15.6611 8.10556 15.6611 8.10556 15.5556 8.21111L12.2833 15.9167C12.1778 16.1278 12.1778 16.2333 12.0722 16.3389C11.9667 16.4444 11.7556 16.3389 11.5444 16.3389H9.96111C9.85556 16.3389 9.75 16.3389 9.75 16.1278L8.06111 9.58333C7.85 9.37222 7.53333 9.05556 7.11111 8.95C6.47778 8.63333 5.31667 8.42222 5.10556 8.42222L5 8.21111Z" fill="white" style="fill:white;fill-opacity:1;"></path></svg>',
        },
        {
          name: "mastercard",
          image: null,
          svg: '<svg class="sv-footer__payment-icon sv-footer__payment-icon--mastercard" xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 38 24" width="38" height="24" fill="none" aria-labelledby="pi-master"><title id="pi-master">Mastercard</title><rect x=".5" y=".5" width="37" height="23" rx="2.5" stroke="#000" stroke-opacity=".07" fill="none"></rect><path d="M35 0H3C1.3 0 0 1.3 0 3V21C0 22.7 1.4 24 3 24H35C36.7 24 38 22.7 38 21V3C38 1.3 36.6 0 35 0Z" fill="#1C1C1C" style="fill:#1C1C1C;fill:color(display-p3 0.1098 0.1098 0.1098);fill-opacity:1;"></path><path d="M35 1C36.1 1 37 1.9 37 3V21C37 22.1 36.1 23 35 23H3C1.9 23 1 22.1 1 21V3C1 1.9 1.9 1 3 1H35Z" fill="#232323" style="fill:#232323;fill:color(display-p3 0.1373 0.1373 0.1373);fill-opacity:1;"></path><path d="M14.6364 19.2727C18.8538 19.2727 22.2727 15.8538 22.2727 11.6364C22.2727 7.41892 18.8538 4 14.6364 4C10.4189 4 7 7.41892 7 11.6364C7 15.8538 10.4189 19.2727 14.6364 19.2727Z" fill="#EB001B" style="fill:#EB001B;fill:color(display-p3 0.9216 0.0000 0.1059);fill-opacity:1;"></path><path d="M23.3637 19.2727C27.5811 19.2727 31 15.8538 31 11.6364C31 7.41892 27.5811 4 23.3637 4C19.1462 4 15.7273 7.41892 15.7273 11.6364C15.7273 15.8538 19.1462 19.2727 23.3637 19.2727Z" fill="#F79E1B" style="fill:#F79E1B;fill:color(display-p3 0.9686 0.6196 0.1059);fill-opacity:1;"></path><path d="M22.2727 11.6362C22.2727 9.01797 20.9637 6.72706 19 5.41797C17.0364 6.83615 15.7273 9.12706 15.7273 11.6362C15.7273 14.1452 17.0364 16.5452 19 17.8543C20.9637 16.5452 22.2727 14.2543 22.2727 11.6362Z" fill="#FF5F00" style="fill:#FF5F00;fill:color(display-p3 1.0000 0.3725 0.0000);fill-opacity:1;"></path></svg>',
        },
        {
          name: "rupay",
          image: {
            src: img30,
            alt: "RuPay",
            width: null,
            height: null,
          },
          svg: null,
        },
      ],
    },
    signature: "meant to be kept",
    legal: {
      brand: "INDIA KITSCH",
      ownership: "is a brand owned and operated by",
      company: "Company name",
      copyright: "© 2026 INDIA KITSCH. All rights reserved.",
      links: [
        {
          label: "Privacy",
          href: "/policies/privacy-policy",
        },
        {
          label: "Returns",
          href: "/policies/refund-policy",
        },
        {
          label: "Shipping",
          href: "/policies/shipping-policy",
        },
        {
          label: "Terms",
          href: "/policies/terms-of-service",
        },
      ],
    },
  },
};

export const home: HomeContent = {
  slides: [
    {
      href: "/collections/diwali-shirts-for-women",
      label: "Shop Diwali shirts for women",
      desktop: {
        src: img17,
        alt: "Four women in festive outfits celebrating Diwali with diyas and rangoli",
        width: null,
        height: null,
      },
      mobile: {
        src: img22,
      },
    },
    {
      href: "/collections/wildflower-embroidered-cotton-shirts-for-women",
      label: "Shop Wildflower embroidered cotton shirts",
      desktop: {
        src: img18,
        alt: "Woman wearing a light blue embroidered cotton shirt. Breathe Easy. Stand Apart.",
        width: null,
        height: null,
      },
      mobile: {
        src: img21,
      },
    },
    {
      href: "/collections/artisan-embroidered-cotton-shirt",
      label: "Shop Artisan embroidered cotton shirts",
      desktop: {
        src: img19,
        alt: "Woman wearing a orange embroidered cotton shirt. Style It Your Way. Our Edit. Effortless possibilities.",
        width: null,
        height: null,
      },
      mobile: {
        src: img20,
      },
    },
  ],
  seoHeading: "Women's Embroidered Shirts",
  fabric: {
    eyebrow: "NATURAL FIBRES",
    heading: "Shop by Fabric",
    cards: [
      {
        title: "Cotton",
        href: "/collections/cotton-embroidered-shirt-for-women",
        image: {
          src: img23,
          alt: "Cotton",
          width: null,
          height: null,
        },
      },
      {
        title: "Linen",
        href: "/collections/linen-embroidered-shirt-for-women",
        image: {
          src: img24,
          alt: "Linen",
          width: null,
          height: null,
        },
      },
    ],
  },
  mostLoved: {
    heading: "Most Loved Designs",
    products: [
      "round-nack-embro-shirt-terracotta",
      "sleeve-flower-embroidery-shirt-blue",
      "white-medallion-embroidered-cotton-shirt",
    ],
  },
  trust: [
    {
      icon: "leaf",
      title: "Natural fabrics",
      text: "Breathable cotton and linen",
      mobileLabel: "Natural Fibres",
    },
    {
      icon: "return",
      title: "Easy returns",
      text: "7 day easy return",
      mobileLabel: "7-Day Returns",
    },
    {
      icon: "lock",
      title: "Secure checkout",
      text: "Protected online payments",
      mobileLabel: "Secure Pay",
    },
  ],
  newEdit: {
    heading: "The New Edit",
    products: [
      "white-medallion-embroidered-cotton-shirt",
      "pink-medallion-embroidered-cotton-shirt",
      "blue-medallion-embroidered-cotton-shirt",
    ],
  },
  reels: {
    heading: "A Closer Look",
    items: [
      {
        poster: img25,
        video: null,
        label: "Reel 1",
      },
      {
        poster: img26,
        video: null,
        label: "Reel 2",
      },
      {
        poster: img27,
        video: null,
        label: "Reel 3",
      },
    ],
  },
  signature: {
    heading: "Our Signature Designs",
    products: [
      "white-medallion-embroidered-cotton-shirt",
      "sleeve-flower-embroidery-shirt-blue",
      "round-nack-embro-shirt-terracotta",
    ],
  },
  editorial: {
    words: [
      {
        text: "NATURAL FABRIC",
        outline: false,
      },
      {
        text: "EARTHY COLORS",
        outline: true,
      },
      {
        text: "NATURAL FABRIC",
        outline: false,
      },
      {
        text: "EARTHY COLORS",
        outline: true,
      },
      {
        text: "NATURAL FABRIC",
        outline: false,
      },
      {
        text: "EARTHY COLORS",
        outline: true,
      },
      {
        text: "NATURAL FABRIC",
        outline: false,
      },
      {
        text: "EARTHY COLORS",
        outline: true,
      },
    ],
    label: "NATURAL FABRIC, EARTHY COLORS",
    model: {
      src: img28,
      alt: "Woman wearing a shirt with distinctive embroidery",
      width: null,
      height: null,
    },
  },
};
