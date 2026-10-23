// Plain module (no "use client"), so both Server Components and the client
// ProductForm can import these values. A non-component export from a
// "use client" file reaches a Server Component as a client reference, not
// the real array — calling `.find` on it throws.

/** Display labels only — the stored values stay draft/active/archived. */
export const PRODUCT_STATUS_OPTIONS = [
  { value: "draft", label: "Draft", hint: "Not on the store yet." },
  { value: "active", label: "Live", hint: "On the store — customers can buy it." },
  {
    value: "archived",
    label: "Archived",
    hint: "Taken off the store; kept for past orders.",
  },
] as const;
