// Placeholder copy for the information pages. Same structure as the final
// pages so the layout can be reviewed; every string here is meant to be
// replaced with India Kitsch's own content (policies need legal review).
import type {
  ContactContent,
  FaqContent,
  PolicyContent,
  PolicyHandle,
  StoryContent,
} from "../_lib/content";
import storyImage from "./media/images/story-hero.webp";

const P = (text: string) => `<p>${text}</p>`;

export const story: StoryContent = {
  meta: { title: "About | India Kitsch", description: "" },
  hero: {
    eyebrow: "Our story",
    titleHtml: "Placeholder headline for <em>India Kitsch.</em>",
    html: P(
      "A short introduction to India Kitsch goes here: where the brand started, who it is for and what makes it different.",
    ),
    meta: ["City · India", "Since 20XX"],
    image: { src: storyImage, alt: "Placeholder image", width: null, height: null },
    caption: "India Kitsch · Placeholder caption",
  },
  chapters: [
    {
      index: "01",
      offset: false,
      eyebrow: "Chapter one",
      titleHtml: "First chapter heading <em>goes here.</em>",
      html: P(
        "Placeholder paragraph for the first part of the story. Two or three sentences work best for this layout.",
      ),
      aside: null,
    },
    {
      index: "02",
      offset: true,
      eyebrow: "Chapter two",
      titleHtml: "Second chapter heading <em>goes here.</em>",
      html: P(
        "Placeholder paragraph for the second part of the story. Replace with India Kitsch's own words.",
      ),
      aside: {
        eyebrow: "Our standard",
        line: "A one-line statement of what the brand stands for.",
        html: P("A supporting sentence for the statement above."),
      },
    },
  ],
  principles: {
    number: "03",
    eyebrow: "What defines us",
    title: "Three principles headline goes here.",
    items: [
      {
        number: "01",
        title: "Principle one",
        html: P("One or two sentences explaining this principle."),
      },
      {
        number: "02",
        title: "Principle two",
        html: P("One or two sentences explaining this principle."),
      },
      {
        number: "03",
        title: "Principle three",
        html: P("One or two sentences explaining this principle."),
      },
    ],
  },
  philosophy: {
    eyebrow: "Our philosophy",
    quoteHtml: "A short brand quote <em>goes here.</em>",
  },
  closing: {
    eyebrow: "Closing note",
    title: "Closing headline goes here.",
    html: P("A closing paragraph that invites visitors to explore the collection."),
    links: [],
  },
};

const answer = P("Answer to be added.");

export const faq: FaqContent = {
  meta: { title: "FAQ | India Kitsch", description: "" },
  eyebrow: "Help",
  heading: "FAQ",
  introHtml: P("Answers to common questions about ordering, delivery and returns."),
  identityHtml:
    'A one-paragraph description of India Kitsch for search engines goes here. Explore our <a href="/shop">collection</a>.',
  categories: [
    {
      title: "About India Kitsch",
      description: "The brand and what we make.",
      items: [
        { question: "What is India Kitsch?", html: answer },
        { question: "Where are you based?", html: answer },
      ],
    },
    {
      title: "Orders & payment",
      description: "Placing an order and paying for it.",
      items: [
        { question: "Which payment methods do you accept?", html: answer },
        { question: "Can I change or cancel my order?", html: answer },
      ],
    },
    {
      title: "Shipping & delivery",
      description: "Where we ship and how long it takes.",
      items: [
        { question: "How long does delivery take?", html: answer },
        { question: "How can I track my order?", html: answer },
      ],
    },
    {
      title: "Returns & exchanges",
      description: "If something isn't right.",
      items: [
        { question: "What is your return policy?", html: answer },
        { question: "How do I start a return or exchange?", html: answer },
      ],
    },
  ],
};

export const contact: ContactContent = {
  meta: { title: "Contact | India Kitsch", description: "" },
  eyebrow: "Contact us",
  heading: "We're here to help.",
  descriptionHtml: P("Placeholder introduction for the contact page."),
  supportHtml: P("Placeholder note about what to include when contacting about an order."),
  details: [
    { label: "Brand / Trade name", html: "India Kitsch" },
    { label: "Legal entity", html: "Company name" },
    { label: "Email", html: '<a href="mailto:hello@example.com">hello@example.com</a>' },
    { label: "Call / WhatsApp", html: "+91 00000 00000" },
    { label: "Hours", html: "To be added" },
    { label: "Business address", html: "To be added" },
  ],
};

function policy(title: string, sections: string[]): PolicyContent {
  return {
    meta: { title: `${title} | India Kitsch`, description: "" },
    title,
    html: [
      P(`<strong>Placeholder.</strong> India Kitsch's ${title.toLowerCase()} will be added here.`),
      ...sections.flatMap((s) => [`<h2>${s}</h2>`, P("To be added.")]),
    ].join(""),
  };
}

export const policies: Record<PolicyHandle, PolicyContent> = {
  "shipping-policy": policy("Shipping Policy", [
    "Delivery areas",
    "Processing time",
    "Delivery time",
    "Shipping charges",
  ]),
  "refund-policy": policy("Refund Policy", [
    "Eligibility",
    "How to request a return",
    "Refunds",
    "Exchanges",
  ]),
  "privacy-policy": policy("Privacy Policy", [
    "Information we collect",
    "How we use it",
    "Sharing",
    "Your choices",
    "Contact",
  ]),
  "terms-of-service": policy("Terms of Service", [
    "Using this site",
    "Orders and pricing",
    "Liability",
    "Governing law",
    "Contact",
  ]),
};
