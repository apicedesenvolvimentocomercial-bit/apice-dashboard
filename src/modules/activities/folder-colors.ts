const PALETTE = [
  { dot: '#7F77DD', soft: 'bg-[#7F77DD]', text: 'text-[#7F77DD]' },
  { dot: '#378ADD', soft: 'bg-[#378ADD]', text: 'text-[#378ADD]' },
  { dot: '#EF9F27', soft: 'bg-[#EF9F27]', text: 'text-[#EF9F27]' },
  { dot: '#E879A4', soft: 'bg-[#E879A4]', text: 'text-[#E879A4]' },
  { dot: '#22C2C2', soft: 'bg-[#22C2C2]', text: 'text-[#22C2C2]' },
  { dot: '#F87171', soft: 'bg-[#F87171]', text: 'text-[#F87171]' },
] as const

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function folderColor(userId: string, isCurrent: boolean) {
  if (isCurrent) return { dot: '#10B981', soft: 'bg-emerald-500', text: 'text-emerald-600' }
  const p = PALETTE[hash(userId) % PALETTE.length]
  return p
}
