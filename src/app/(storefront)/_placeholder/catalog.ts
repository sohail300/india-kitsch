// Placeholder catalog and listing content for the static storefront UI,
// borrowed from the Sansevieria site (sibling brand) until the storefront
// reads from the catalog backend. Product links stay inactive until the PDP exists.
import type {
  Article,
  Product,
  ListingContent,
  BlogContent,
  WishlistPageContent,
} from "../_lib/content";
import img0 from "./media/images/orange-terracotta-artisan-shirt-01-neckline-detail.webp";
import img1 from "./media/images/orange-terracotta-artisan-shirt-02-neckline-detail.webp";
import img2 from "./media/images/Cotton_test_report.webp";
import img3 from "./media/images/orange-terracotta-artisan-shirt-03-side.webp";
import img4 from "./media/images/orange-terracotta-artisan-shirt-04-fabric-detail.webp";
import img5 from "./media/images/blue-sky-wildflower-shirt-01-front.webp";
import img6 from "./media/images/blue-sky-wildflower-shirt-03-sleeve-detail.webp";
import img7 from "./media/images/blue-sky-wildflower-shirt-05-back.webp";
import img8 from "./media/images/blue-sky-wildflower-shirt-04-placket-detail.webp";
import img9 from "./media/images/white-warm-ivory-medallion-shirt-01-front.webp";
import img10 from "./media/images/white-warm-ivory-medallion-shirt-02-neckline-detail.webp";
import img11 from "./media/images/white-warm-ivory-medallion-shirt-03-full-look.webp";
import img12 from "./media/images/white-warm-ivory-medallion-shirt-04-back-tucked.webp";
import img13 from "./media/images/pink-soft-blush-medallion-shirt-01-front.webp";
import img14 from "./media/images/pink-soft-blush-medallion-shirt-02-neckline-detail.webp";
import img15 from "./media/images/blue-sky-medallion-shirt-01-front.webp";
import img16 from "./media/images/blue-sky-medallion-shirt-02-neckline-detail.webp";
import img17 from "./media/images/pink-soft-blush-wildflower-shirt-01-front.webp";
import img18 from "./media/images/pink-soft-blush-wildflower-shirt-02-sleeve-detail.webp";
import img19 from "./media/images/white-ivory-wildflower-shirt-01-front.webp";
import img20 from "./media/images/white-ivory-wildflower-shirt-02-sleeve-detail.webp";
import img21 from "./media/images/pink-soft-blush-artisan-shirt-01-neckline-detail.webp";
import img22 from "./media/images/pink-soft-blush-artisan-shirt-02-neckline-detail.webp";
import img23 from "./media/images/white-warm-ivory-artisan-shirt-01-neckline-detail.webp";
import img24 from "./media/images/white-warm-ivory-artisan-shirt-02-neckline-detail.webp";
import img25 from "./media/images/pink-blush-collar-floral-shirt-01-front.webp";
import img26 from "./media/images/pink-blush-collar-floral-shirt-02-collar-detail.webp";
import img27 from "./media/images/orange-terracotta-collar-floral-shirt-01-front.webp";
import img28 from "./media/images/orange-terracotta-collar-floral-shirt-02-collar-detail.webp";
import img29 from "./media/images/yellow-mustard-collar-floral-shirt-01-front.webp";
import img30 from "./media/images/yellow-mustard-collar-floral-shirt-02-collar-detail.webp";
import img31 from "./media/images/pink-soft-blush-back-linen-shirt-01-lifestyle.webp";
import img32 from "./media/images/pink-soft-blush-back-linen-shirt-01.webp";
import img33 from "./media/images/grey-stone-back-linen-shirt-01-lifestyle.webp";
import img34 from "./media/images/Embroidered_Linen_Collar_Detail.webp";
import img35 from "./media/images/green-olive-back-linen-shirt-01-lifestyle.webp";
import img36 from "./media/images/green-olive-back-linen-shirt-01.webp";
import img37 from "./media/images/yellow-mustard-floral-shirt-01-lifestyle.webp";
import img38 from "./media/images/yellow-mustard-floral-shirt-02-embroidery-detail.webp";
import img39 from "./media/images/brown-chocolate-floral-shirt-01-lifestyle.webp";
import img40 from "./media/images/brown-chocolate-floral-shirt-02-embroidery-detail.webp";
import img41 from "./media/images/white-ivory-floral-shirt-01-lifestyle.webp";
import img42 from "./media/images/white-ivory-floral-shirt-02-embroidery-detail.webp";
import img43 from "./media/images/orange-terracotta-floral-shirt-01-lifestyle.webp";
import img44 from "./media/images/orange-terracotta-floral-shirt-02-embroidery-detail.webp";
import img45 from "./media/images/brown-chocolate-landscape-shirt-01-front.webp";
import img46 from "./media/images/brown-chocolate-landscape-shirt-02-landscape-detail.webp";
import img47 from "./media/images/white-warm-ivory-landscape-shirt-01-front.webp";
import img48 from "./media/images/white-warm-ivory-landscape-shirt-02-landscape-detail.webp";
import img49 from "./media/images/grey-slate-landscape-shirt-01-front.webp";
import img50 from "./media/images/grey-slate-landscape-shirt-02-landscape-detail.webp";
import img51 from "./media/articles/ChatGPT_Image_Sep_30_2026_09_21_46_PM.webp";
import img52 from "./media/articles/ChatGPT_Image_Aug_23_2026_12_04_25_AM.webp";
import img53 from "./media/articles/ChatGPT_Image_Aug_17_2026_10_49_45_AM_681de468-10c4-4814-bde4-8a9ea5bb751b.webp";
import img54 from "./media/articles/ChatGPT_Image_Aug_17_2026_10_20_07_AM_db0574c1-2d1e-4acb-be63-7dc85c3de70a.webp";

export const products: Record<string, Product> = {
  "round-nack-embro-shirt-terracotta": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "round-nack-embro-shirt-terracotta",
    url: "/products/round-nack-embro-shirt-terracotta",
    productId: "8000055279681",
    variantId: "44284471803969",
    title: "Artisan Embroidered Cotton Shirt",
    fullTitle: "Terracotta Artisan Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Terracotta",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img0,
        alt: "A woman modeling a rust-colored linen button-up blouse with colorful floral embroidery around the V-neckline, paired with white trousers, against a neutral beige background.",
        width: null,
        height: null,
      },
      {
        src: img1,
        alt: "Close-up of the artisan embroidery around the neckline and front of the terracotta orange cotton shirt.",
        width: null,
        height: null,
      },
      {
        src: img2,
        alt: "Terracotta Artisan Embroidered Cotton Shirt",
        width: null,
        height: null,
      },
      {
        src: img3,
        alt: "Side profile of a woman wearing the terracotta orange artisan embroidered cotton shirt, showing the silhouette and embroidery.",
        width: null,
        height: null,
      },
      {
        src: img4,
        alt: "Close-up of the terracotta orange cotton fabric texture and soft folds.",
        width: null,
        height: null,
      },
    ],
  },
  "sleeve-flower-embroidery-shirt-blue": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "sleeve-flower-embroidery-shirt-blue",
    url: "/products/sleeve-flower-embroidery-shirt-blue",
    productId: "8000055377985",
    variantId: "44284471902273",
    title: "Wildflower Embroidered Cotton Shirt",
    fullTitle: "Sky Blue Wildflower Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Sky Blue",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img5,
        alt: "Woman wearing the sky blue wildflower embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img6,
        alt: "Close-up of multicolour wildflower embroidery on the sleeve of the sky blue cotton shirt.",
        width: null,
        height: null,
      },
      {
        src: img2,
        alt: "Sky Blue Wildflower Embroidered Cotton Shirt",
        width: null,
        height: null,
      },
      {
        src: img7,
        alt: "Back view of the sky blue wildflower embroidered cotton shirt, showing the rear yoke and relaxed fit.",
        width: null,
        height: null,
      },
      {
        src: img8,
        alt: "Close-up of wildflower embroidery and decorative buttons on the front placket of the sky blue cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "white-medallion-embroidered-cotton-shirt": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "SIGNATURE DESIGN",
    lowStock: "Only 3 left",
    handle: "white-medallion-embroidered-cotton-shirt",
    url: "/products/white-medallion-embroidered-cotton-shirt",
    productId: "8050223120449",
    variantId: "44461187006529",
    title: "Medallion Embroidered Cotton Shirt",
    fullTitle: "Warm Ivory Medallion Embroidered Cotton Shirt",
    variantTitle: "Ivory / Free Size · S / M / L",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img9,
        alt: "Woman wearing the warm ivory white medallion embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img10,
        alt: "Close-up of the medallion embroidery around the neckline and front of the warm ivory white cotton shirt.",
        width: null,
        height: null,
      },
      {
        src: img2,
        alt: "Warm Ivory Medallion Embroidered Cotton Shirt",
        width: null,
        height: null,
      },
      {
        src: img11,
        alt: "Full-length look of a woman wearing the warm ivory white medallion embroidered cotton shirt with light trousers.",
        width: null,
        height: null,
      },
      {
        src: img12,
        alt: "Back view of the warm ivory white medallion embroidered cotton shirt tucked into light trousers, showing the yoke and collar.",
        width: null,
        height: null,
      },
    ],
  },
  "pink-medallion-embroidered-cotton-shirt": {
    compareAtPrice: null,
    badge: null,
    label: "SIGNATURE DESIGN",
    lowStock: null,
    handle: "pink-medallion-embroidered-cotton-shirt",
    url: "/products/pink-medallion-embroidered-cotton-shirt",
    productId: "8050223185985",
    variantId: "44461187203137",
    title: "Medallion Embroidered Cotton Shirt",
    fullTitle: "Soft Blush Pink Medallion Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Blush pink",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img13,
        alt: "Woman wearing the soft blush pink medallion embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img14,
        alt: "Close-up of the medallion embroidery around the neckline and front of the soft blush pink cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "blue-medallion-embroidered-cotton-shirt": {
    compareAtPrice: null,
    badge: null,
    label: "SIGNATURE DESIGN",
    lowStock: null,
    handle: "blue-medallion-embroidered-cotton-shirt",
    url: "/products/blue-medallion-embroidered-cotton-shirt",
    productId: "8050223251521",
    variantId: "44461187268673",
    title: "Medallion Embroidered Cotton Shirt",
    fullTitle: "Sky Blue Medallion Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Sky Blue",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img15,
        alt: "Woman wearing the sky blue medallion embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img16,
        alt: "Close-up of the medallion embroidery around the neckline and front of the sky blue cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "sleeve-flower-embroidery-shirt-pink": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "sleeve-flower-embroidery-shirt-pink",
    url: "/products/sleeve-flower-embroidery-shirt-pink",
    productId: "8000054788161",
    variantId: "44284471312449",
    title: "Wildflower Embroidered Cotton Shirt",
    fullTitle: "Soft Blush Pink Wildflower Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Blush Pink",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img17,
        alt: "Woman wearing the soft blush pink wildflower embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img18,
        alt: "Close-up of multicolour wildflower embroidery on the sleeve of the soft blush pink cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "sleeve-flower-embroidery-shirt-white": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "sleeve-flower-embroidery-shirt-white",
    url: "/products/sleeve-flower-embroidery-shirt-white",
    productId: "8000055345217",
    variantId: "44284471869505",
    title: "Wildflower Embroidered Cotton Shirt",
    fullTitle: "Ivory Wildflower Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Ivory",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img19,
        alt: "Woman wearing the ivory wildflower embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img20,
        alt: "Close-up of multicolour wildflower embroidery on the sleeve of the ivory cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "round-nack-embro-shirt-pink": {
    compareAtPrice: null,
    badge: null,
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "round-nack-embro-shirt-pink",
    url: "/products/round-nack-embro-shirt-pink",
    productId: "8000055214145",
    variantId: "44284471738433",
    title: "Artisan Embroidered Cotton Shirt",
    fullTitle: "Soft Blush Pink Artisan Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Blush Pink",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img21,
        alt: "A woman modeling a light pink linen button-up shirt with intricate multicolor embroidery on the chest, paired with beige trousers, against a solid beige background.",
        width: null,
        height: null,
      },
      {
        src: img22,
        alt: "Close-up of the artisan embroidery around the neckline and front of the soft blush pink cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "round-nack-embro-shirt-off-white": {
    compareAtPrice: null,
    badge: "STATEMENT PIECE",
    label: "India Kitsch Signature",
    lowStock: null,
    handle: "round-nack-embro-shirt-off-white",
    url: "/products/round-nack-embro-shirt-off-white",
    productId: "8000054820929",
    variantId: "44284471345217",
    title: "Artisan Embroidered Cotton Shirt",
    fullTitle: "Warm Ivory Artisan Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Warm Ivory",
    price: "₹1,999",
    priceCents: 199900,
    soldOut: false,
    images: [
      {
        src: img23,
        alt: "A woman wearing a white linen button-up blouse with colorful floral embroidery around the neckline, paired with beige trousers, set against a solid beige studio background.",
        width: null,
        height: null,
      },
      {
        src: img24,
        alt: "Close-up of the artisan embroidery around the neckline and front of the warm ivory white cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "blush-pink-floral-embroidered-cotton-shirt": {
    compareAtPrice: null,
    badge: "EVERYDAY ESSENTIAL",
    label: null,
    lowStock: null,
    handle: "blush-pink-floral-embroidered-cotton-shirt",
    url: "/products/blush-pink-floral-embroidered-cotton-shirt",
    productId: "8000055083073",
    variantId: "44284471607361",
    title: "Collar Floral Embroidered Cotton Shirt",
    fullTitle: "Blush Pink Collar Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Blush Pink",
    price: "₹1,899",
    priceCents: 189900,
    soldOut: false,
    images: [
      {
        src: img25,
        alt: "Woman wearing the blush pink collar floral embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img26,
        alt: "Close-up of floral embroidery on the collar and front of the blush pink cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "collar-tiny-line-flower-embro-shirt-teracotta": {
    compareAtPrice: null,
    badge: null,
    label: null,
    lowStock: null,
    handle: "collar-tiny-line-flower-embro-shirt-teracotta",
    url: "/products/collar-tiny-line-flower-embro-shirt-teracotta",
    productId: "8000054853697",
    variantId: "44284471377985",
    title: "Collar Floral Embroidered Cotton Shirt",
    fullTitle: "Terracotta Collar Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Terracotta",
    price: "₹1,899",
    priceCents: 189900,
    soldOut: false,
    images: [
      {
        src: img27,
        alt: "Woman wearing the terracotta orange collar floral embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img28,
        alt: "Close-up of floral embroidery on the collar and front of the terracotta orange cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "collar-tiny-line-flower-embro-shirt-yellow": {
    compareAtPrice: null,
    badge: null,
    label: null,
    lowStock: null,
    handle: "collar-tiny-line-flower-embro-shirt-yellow",
    url: "/products/collar-tiny-line-flower-embro-shirt-yellow",
    productId: "8000055246913",
    variantId: "44284471771201",
    title: "Collar Floral Embroidered Cotton Shirt",
    fullTitle: "Mustard Collar Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Mustard",
    price: "₹1,899",
    priceCents: 189900,
    soldOut: false,
    images: [
      {
        src: img29,
        alt: "Woman wearing the mustard yellow collar floral embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img30,
        alt: "Close-up of floral embroidery on the collar and front of the mustard yellow cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "linen-back-embro-shirt-pink": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "Statement Embroidery",
    lowStock: null,
    handle: "linen-back-embro-shirt-pink",
    url: "/products/linen-back-embro-shirt-pink",
    productId: "8000054952001",
    variantId: "44284471476289",
    title: "Back Embroidered Linen Shirt",
    fullTitle: "Soft Blush Pink Back Embroidered Linen Shirt",
    variantTitle: "Free Size · M / L/ XL / Blush Pink",
    price: "₹3,499",
    priceCents: 349900,
    soldOut: false,
    images: [
      {
        src: img31,
        alt: "Woman wearing the soft blush pink back embroidered embroidered linen shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img32,
        alt: "Close-up back view of a person wearing a dusty pink linen shirt with a small embroidered floral detail on the upper back.",
        width: null,
        height: null,
      },
    ],
  },
  "linen-back-embro-shirt-grey": {
    compareAtPrice: null,
    badge: "THE LINEN EDIT",
    label: "Statement Embroidery",
    lowStock: null,
    handle: "linen-back-embro-shirt-grey",
    url: "/products/linen-back-embro-shirt-grey",
    productId: "8000055312449",
    variantId: "44284471836737",
    title: "Back Embroidered Linen Shirt",
    fullTitle: "Stone Grey Back Embroidered Linen Shirt",
    variantTitle: "Free Size · M / L/ XL / Stone Grey",
    price: "₹3,499",
    priceCents: 349900,
    soldOut: false,
    images: [
      {
        src: img33,
        alt: "Woman wearing the stone grey back embroidered embroidered linen shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img34,
        alt: "Close-up back view of a person wearing a light beige linen collared shirt with a small embroidered purple and green floral detail on the upper back.",
        width: null,
        height: null,
      },
    ],
  },
  "linen-back-embro-shirt-olive-green": {
    compareAtPrice: null,
    badge: "BESTSELLER",
    label: "Statement Embroidery",
    lowStock: "Only 2 left",
    handle: "linen-back-embro-shirt-olive-green",
    url: "/products/linen-back-embro-shirt-olive-green",
    productId: "8000055148609",
    variantId: "44284471672897",
    title: "Back Embroidered Linen Shirt",
    fullTitle: "Olive Back Embroidered Linen Shirt",
    variantTitle: "Free Size · M / L/ XL / Olive",
    price: "₹3,499",
    priceCents: 349900,
    soldOut: false,
    images: [
      {
        src: img35,
        alt: "Woman wearing the olive green back embroidered embroidered linen shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img36,
        alt: "Close-up back view of a person wearing an olive green linen shirt with a small embroidered floral detail on the upper back.",
        width: null,
        height: null,
      },
    ],
  },
  "small-flower-vertical-embro-shirt-yellow": {
    compareAtPrice: "₹2,010",
    badge: "BESTSELLER",
    label: null,
    lowStock: null,
    handle: "small-flower-vertical-embro-shirt-yellow",
    url: "/products/small-flower-vertical-embro-shirt-yellow",
    productId: "8000054886465",
    variantId: "44284471410753",
    title: "Floral Embroidered Cotton Shirt",
    fullTitle: "Mustard Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Mustard",
    price: "₹1,799",
    priceCents: 179900,
    soldOut: false,
    images: [
      {
        src: img37,
        alt: "Woman wearing the mustard yellow floral embroidered cotton shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img38,
        alt: "Close-up of the embroidery on the mustard yellow floral embroidered cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "small-flower-vertical-embro-shirt-brown": {
    compareAtPrice: "₹2,010",
    badge: "EVERYDAY ESSENTIAL",
    label: null,
    lowStock: null,
    handle: "small-flower-vertical-embro-shirt-brown",
    url: "/products/small-flower-vertical-embro-shirt-brown",
    productId: "8000054919233",
    variantId: "44284471443521",
    title: "Floral Embroidered Cotton Shirt",
    fullTitle: "Chocolate Brown Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Chocolate Brown",
    price: "₹1,799",
    priceCents: 179900,
    soldOut: false,
    images: [
      {
        src: img39,
        alt: "Woman wearing the chocolate brown floral embroidered cotton shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img40,
        alt: "Close-up of the embroidery on the chocolate brown floral embroidered cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "small-flower-vertical-embro-shirt-white": {
    compareAtPrice: "₹2,010",
    badge: "BESTSELLER",
    label: null,
    lowStock: null,
    handle: "small-flower-vertical-embro-shirt-white",
    url: "/products/small-flower-vertical-embro-shirt-white",
    productId: "8000055050305",
    variantId: "44284471574593",
    title: "Floral Embroidered Cotton Shirt",
    fullTitle: "Ivory Floral Embroidered Cotton Shirt for Women",
    variantTitle: "Free Size · S / M / L / Ivory",
    price: "₹1,799",
    priceCents: 179900,
    soldOut: false,
    images: [
      {
        src: img41,
        alt: "Woman wearing the ivory floral embroidered cotton shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img42,
        alt: "Close-up of the embroidery on the ivory floral embroidered cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "small-flower-vertical-embro-shirt-teracotta": {
    compareAtPrice: "₹2,010",
    badge: "BESTSELLER",
    label: null,
    lowStock: null,
    handle: "small-flower-vertical-embro-shirt-teracotta",
    url: "/products/small-flower-vertical-embro-shirt-teracotta",
    productId: "8000055017537",
    variantId: "44284471541825",
    title: "Floral Embroidered Cotton Shirt",
    fullTitle: "Terracotta Floral Embroidered Cotton Shirt",
    variantTitle: "Free Size · S / M / L / Terracotta",
    price: "₹1,799",
    priceCents: 179900,
    soldOut: false,
    images: [
      {
        src: img43,
        alt: "Woman wearing the terracotta orange floral embroidered cotton shirt in a styled lifestyle setting.",
        width: null,
        height: null,
      },
      {
        src: img44,
        alt: "Close-up of the embroidery on the terracotta orange floral embroidered cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "wheat-embroidery-cotton-shirt-brown": {
    compareAtPrice: "₹2,010",
    badge: null,
    label: null,
    lowStock: "Only 2 left",
    handle: "wheat-embroidery-cotton-shirt-brown",
    url: "/products/wheat-embroidery-cotton-shirt-brown",
    productId: "8000054984769",
    variantId: "44284471509057",
    title: "Landscape Embroidered Cotton Shirt",
    fullTitle: "Chocolate Brown Landscape Embroidered Cotton Shirt",
    variantTitle: "Free Size · XS/ S / Chocolate Brown",
    price: "₹1,699",
    priceCents: 169900,
    soldOut: false,
    images: [
      {
        src: img45,
        alt: "Woman wearing the chocolate brown landscape embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img46,
        alt: "Close-up of the landscape embroidery with wheat, sun and stitched lines on the chocolate brown cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "wheat-embroidery-cotton-shirt-white": {
    compareAtPrice: "₹2,010",
    badge: null,
    label: null,
    lowStock: null,
    handle: "wheat-embroidery-cotton-shirt-white",
    url: "/products/wheat-embroidery-cotton-shirt-white",
    productId: "8000055115841",
    variantId: "44284471640129",
    title: "Landscape Embroidered Cotton Shirt",
    fullTitle: "Warm Ivory Landscape Embroidered Cotton Shirt",
    variantTitle: "Free Size · XS/ S / Warm Ivory",
    price: "₹1,699",
    priceCents: 169900,
    soldOut: false,
    images: [
      {
        src: img47,
        alt: "Woman wearing the warm ivory white landscape embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img48,
        alt: "Close-up of the landscape embroidery with wheat, sun and stitched lines on the warm ivory white cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
  "wheat-embroidery-cotton-shirt-green": {
    compareAtPrice: "₹2,010",
    badge: null,
    label: null,
    lowStock: null,
    handle: "wheat-embroidery-cotton-shirt-green",
    url: "/products/wheat-embroidery-cotton-shirt-green",
    productId: "8000055181377",
    variantId: "44284471705665",
    title: "Landscape Embroidered Cotton Shirt",
    fullTitle: "Slate Grey Landscape Embroidered Cotton Shirt",
    variantTitle: "Free Size · XS/ S / Slate Grey",
    price: "₹1,699",
    priceCents: 169900,
    soldOut: false,
    images: [
      {
        src: img49,
        alt: "Woman wearing the slate grey landscape embroidered cotton shirt, front view.",
        width: null,
        height: null,
      },
      {
        src: img50,
        alt: "Close-up of the landscape embroidery with wheat, sun and stitched lines on the slate grey cotton shirt.",
        width: null,
        height: null,
      },
    ],
  },
};

export const collection: ListingContent & {
  title: string;
  filters: string[];
  sortOptions: { value: string; label: string }[];
} = {
  meta: {
    title: "Shop all | India Kitsch",
    description: "",
  },
  title: "Women's Embroidered Cotton & Linen Shirts",
  filters: ["Availability", "Price", "Sort"],
  sortOptions: [
    {
      value: "manual",
      label: "Featured",
    },
    {
      value: "most-relevant",
      label: "Most relevant",
    },
    {
      value: "best-selling",
      label: "Best selling",
    },
    {
      value: "title-ascending",
      label: "Alphabetically, A-Z",
    },
    {
      value: "title-descending",
      label: "Alphabetically, Z-A",
    },
    {
      value: "price-ascending",
      label: "Price, low to high",
    },
    {
      value: "price-descending",
      label: "Price, high to low",
    },
    {
      value: "created-ascending",
      label: "Date, old to new",
    },
    {
      value: "created-descending",
      label: "Date, new to old",
    },
    {
      value: "manual",
      label: "Featured",
    },
    {
      value: "most-relevant",
      label: "Most relevant",
    },
    {
      value: "best-selling",
      label: "Best selling",
    },
    {
      value: "title-ascending",
      label: "Alphabetically, A-Z",
    },
    {
      value: "title-descending",
      label: "Alphabetically, Z-A",
    },
    {
      value: "price-ascending",
      label: "Price, low to high",
    },
    {
      value: "price-descending",
      label: "Price, high to low",
    },
    {
      value: "created-ascending",
      label: "Date, old to new",
    },
    {
      value: "created-descending",
      label: "Date, new to old",
    },
  ],
  products: [
    "sleeve-flower-embroidery-shirt-blue",
    "sleeve-flower-embroidery-shirt-pink",
    "sleeve-flower-embroidery-shirt-white",
    "blue-medallion-embroidered-cotton-shirt",
    "white-medallion-embroidered-cotton-shirt",
    "pink-medallion-embroidered-cotton-shirt",
    "round-nack-embro-shirt-terracotta",
    "round-nack-embro-shirt-pink",
    "round-nack-embro-shirt-off-white",
    "blush-pink-floral-embroidered-cotton-shirt",
    "collar-tiny-line-flower-embro-shirt-teracotta",
    "collar-tiny-line-flower-embro-shirt-yellow",
    "linen-back-embro-shirt-pink",
    "linen-back-embro-shirt-grey",
    "linen-back-embro-shirt-olive-green",
    "small-flower-vertical-embro-shirt-yellow",
    "small-flower-vertical-embro-shirt-brown",
    "small-flower-vertical-embro-shirt-white",
    "small-flower-vertical-embro-shirt-teracotta",
    "wheat-embroidery-cotton-shirt-brown",
    "wheat-embroidery-cotton-shirt-white",
    "wheat-embroidery-cotton-shirt-green",
  ],
};

export const search: ListingContent & { heading: string; placeholder: string } = {
  meta: {
    title: "Search | India Kitsch",
    description: "",
  },
  heading: "Search",
  placeholder: "Search",
  products: [
    "blush-pink-floral-embroidered-cotton-shirt",
    "small-flower-vertical-embro-shirt-brown",
    "wheat-embroidery-cotton-shirt-brown",
    "small-flower-vertical-embro-shirt-white",
    "sleeve-flower-embroidery-shirt-white",
    "collar-tiny-line-flower-embro-shirt-yellow",
    "small-flower-vertical-embro-shirt-yellow",
    "linen-back-embro-shirt-olive-green",
    "blue-medallion-embroidered-cotton-shirt",
    "sleeve-flower-embroidery-shirt-blue",
    "wheat-embroidery-cotton-shirt-green",
    "round-nack-embro-shirt-pink",
    "linen-back-embro-shirt-pink",
    "pink-medallion-embroidered-cotton-shirt",
    "sleeve-flower-embroidery-shirt-pink",
    "linen-back-embro-shirt-grey",
    "round-nack-embro-shirt-terracotta",
    "collar-tiny-line-flower-embro-shirt-teracotta",
    "small-flower-vertical-embro-shirt-teracotta",
    "round-nack-embro-shirt-off-white",
    "wheat-embroidery-cotton-shirt-white",
    "white-medallion-embroidered-cotton-shirt",
  ],
};

const articles: Article[] = [
  {
    featured: true,
    title: "Diwali Office Party Outfit Ideas for Women: 7 Elegant Looks | INDIA KITSCH",
    href: "/blogs/style-guide/diwali-office-party-outfit-ideas-women",
    date: "19 Oct 2026",
    datetime: "2026-10-19",
    excerpt:
      "Diwali Office Party Outfit Ideas for Women | India Kitsch Home / Style Guide / Diwali Office Style THE INDIA KITSCH JOURNAL · FESTIVE STYLE 7 Elegant Diwali Office Party...",
    readLabel: "Read story →",
    image: {
      src: img51,
      alt: "Diwali Office Party Outfit Ideas for Women: 7 Elegant Looks | SANSEVIERIA",
      width: null,
      height: null,
    },
  },
  {
    featured: false,
    title: "Festive Outfits for Women: Modern, Comfortable Indian Festive Wear",
    href: "/blogs/style-guide/festive-outfits-for-women",
    date: "22 Aug 2026",
    datetime: "2026-08-22",
    excerpt:
      "Discover modern festive outfits for women who want to feel elegant, comfortable and still like themselves....",
    readLabel: "Read story →",
    image: {
      src: img52,
      alt: "“Woman wearing ivory embroidered cotton shirt styled as a modern festive outfit for women”",
      width: null,
      height: null,
    },
  },
  {
    featured: false,
    title: "Natural vs Synthetic Fabrics: What Should You Wear in Indian Summers?",
    href: "/blogs/style-guide/natural-vs-synthetic-fabrics-for-indian-summers",
    date: "16 Aug 2026",
    datetime: "2026-08-16",
    excerpt:
      "Natural vs synthetic fabrics for summer: discover why breathable cotton and linen are comfortable, versatile choices...",
    readLabel: "Read story →",
    image: {
      src: img53,
      alt: "Six lightweight shirts in rust, cream, blue, blush, olive, and pink hang on a wooden rack against a neutral wall with soft natural shadows.",
      width: null,
      height: null,
    },
  },
  {
    featured: false,
    title: "How to Style Embroidered Shirts for Women: 7 Easy Outfit Ideas",
    href: "/blogs/style-guide/how-to-style-embroidered-shirts-for-women",
    date: "16 Aug 2026",
    datetime: "2026-08-16",
    excerpt:
      "Learn how to style embroidered shirts for women with 7 easy outfit ideas for work, weekends,...",
    readLabel: "Read story →",
    image: {
      src: img54,
      alt: "Three workwear looks featuring the same white embroidered shirt styled with navy trousers for meetings, creative days, and after-hours wear.",
      width: null,
      height: null,
    },
  },
];

export const blog: BlogContent = {
  ...{
    meta: {
      title: "Blog | India Kitsch",
      description: "",
    },
    eyebrow: "OUR JOURNAL",
    title: "Style Guide",
    intro:
      "Stories of natural fibres, thoughtful dressing and the details that make a piece worth keeping.",
  },
  articles,
};

export const wishlistPage: WishlistPageContent = {
  meta: {
    title: "Wishlist | India Kitsch",
    description: "",
  },
  eyebrow: "Saved for later",
  title: "My wishlist",
  introHtml: "<p>Keep the pieces you love in one place and return to them anytime.</p>",
  deviceNote: "Saved privately on this browser and device.",
};
