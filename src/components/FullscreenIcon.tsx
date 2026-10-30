export default function FullscreenIcon({ active = false, size = 22 }: { active?: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={active ? 'M9 3H7v4H3v2h6V3Zm8 0h-2v6h6V7h-4V3ZM3 15v2h4v4h2v-6H3Zm12 0v6h2v-4h4v-2h-6Z' : 'M3 3h6v2H5v4H3V3Zm12 0h6v6h-2V5h-4V3ZM3 15h2v4h4v2H3v-6Zm16 0h2v6h-6v-2h4v-4Z'}/></svg>;
}
