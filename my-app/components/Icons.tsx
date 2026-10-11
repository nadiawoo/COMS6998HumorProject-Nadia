// Small pictograms in the spirit of transit signage: one stroke weight, currentColor.
type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode, fill = false) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden
    fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const WalkIcon = ({ size = 20, className }: P) => svg(size, className, <>
  {/* pedestrian pictogram: head, torso, one arm forward + one back, two legs */}
  <circle cx="13.3" cy="4.3" r="1.35" fill="currentColor" stroke="none" />
  <path d="M12.5 8.5L11 14.5" strokeWidth={2.6} />
  <path d="M12.3 9.5L15.5 12M12.3 9.5L9 12" />
  <path d="M11 14.5L14 17.5L14.5 21.5M11 14.5L8.5 21" />
</>);
export const BridgeIcon = ({ size = 20, className }: P) => svg(size, className, <>
  <path d="M2 16h20M5 16V7M19 16V7M5 7c3 5 11 5 14 0M9 16v-4M12 16v-3.5M15 16v-4" />
</>);
export const ViewIcon = ({ size = 20, className }: P) => svg(size, className, <>
  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" />
</>);
export const ClockIcon = ({ size = 20, className }: P) => svg(size, className, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const PinIcon = ({ size = 20, className }: P) => svg(size, className, <><path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>);
export const ForkIcon = ({ size = 20, className }: P) => svg(size, className, <><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11" /></>);
export const TransferIcon = ({ size = 20, className }: P) => svg(size, className, <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>);
export const AlertIcon = ({ size = 20, className }: P) => svg(size, className, <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18v.5" /></>);
export const UpIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M12 19V5M5 12l7-7 7 7" />);
export const DownIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M12 5v14M19 12l-7 7-7-7" />);
export const CheckIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M4 12l5 5L20 6" />);
export const CameraIcon = ({ size = 18, className }: P) => svg(size, className, <><path d="M3 8h4l2-3h6l2 3h4v12H3z" /><circle cx="12" cy="13" r="3.5" /></>);
export const ArrowIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M5 12h14M13 6l6 6-6 6" />);
export const PlusIcon = ({ size = 18, className }: P) => svg(size, className, <path d="M12 5v14M5 12h14" />);
export const SunIcon = ({ size = 20, className }: P) => svg(size, className, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>);
