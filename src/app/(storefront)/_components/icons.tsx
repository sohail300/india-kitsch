import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
  </Svg>
);

export const BagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Svg>
);

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg size={12} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const ArrowRight = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M4 12h15m-5-5 5 5-5 5" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
    <path d="M5 19 13 11" />
  </Svg>
);

export const ReturnIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M9 8H5V4" />
    <path d="M5.5 8A8 8 0 1 1 4 13" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);

export const SoundOffIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z" />
    <path d="m16 10 4 4m0-4-4 4" />
  </Svg>
);

export const SoundOnIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M17.8 7a7 7 0 0 1 0 10" />
  </Svg>
);

export const GridIcon = ({ cells = 2, ...p }: IconProps & { cells?: number }) => {
  const step = 16 / cells;
  const rects = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={4 + c * step + 0.8}
          y={4 + r * step + 0.8}
          width={step - 1.6}
          height={step - 1.6}
          rx={0.8}
        />,
      );
    }
  }
  return (
    <Svg size={18} strokeWidth={1.2} {...p}>
      {rects}
    </Svg>
  );
};

export const FilterIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Svg>
);

export const InstagramIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
  </Svg>
);

export const FacebookIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M14 8.5h2V5h-2.5A3.5 3.5 0 0 0 10 8.5V11H8v3.5h2V20h3.5v-5.5H16l.5-3.5h-3V9a.5.5 0 0 1 .5-.5Z" />
  </Svg>
);

export const MailIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
