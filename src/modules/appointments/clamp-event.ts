export const MIN_VISIBLE_BLOCK = 20 // minutos: altura mínima garantida p/ evento clampado

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Encaixa um evento [startWall,endWall] (strings SP "YYYY-MM-DDTHH:mm:ss") dentro
// da janela do expediente [minMin,maxMin] (minutos do dia). O grid do timeGrid é
// limitado ao expediente (slotMinTime/slotMaxTime), então um evento agendado fora
// dele (ex.: 20:00 com expediente até 18:00) NÃO renderiza — cai fora do eixo.
// Aqui encostamos no fim (ou início) do expediente, preservando a data e
// garantindo bloco visível mínimo. `clamped` sinaliza p/ mostrar o horário real
// no título (não mentir a hora).
export function clampEventToWindow(
  startWall: string,
  endWall: string,
  minMin: number,
  maxMin: number
): { start: string; end: string; clamped: boolean } {
  const date = startWall.slice(0, 10)
  let startMin = Number(startWall.slice(11, 13)) * 60 + Number(startWall.slice(14, 16))
  let endMin =
    endWall.slice(0, 10) === date
      ? Number(endWall.slice(11, 13)) * 60 + Number(endWall.slice(14, 16))
      : maxMin // cruza a meia-noite → corta no fim do expediente
  const windowLen = Math.max(MIN_VISIBLE_BLOCK, maxMin - minMin)
  const block = Math.min(Math.max(endMin - startMin, MIN_VISIBLE_BLOCK), windowLen)
  let clamped = false
  if (startMin >= maxMin) {
    // Depois do expediente → encosta no fim.
    endMin = maxMin
    startMin = Math.max(minMin, maxMin - block)
    clamped = true
  } else if (startMin < minMin) {
    // Antes do expediente → encosta no início.
    startMin = minMin
    endMin = Math.min(maxMin, minMin + block)
    clamped = true
  } else if (endMin > maxMin) {
    // Começou dentro mas transborda → corta no fim.
    endMin = maxMin
    clamped = true
  }
  const fmt = (mins: number) => `${date}T${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}:00`
  return { start: fmt(startMin), end: fmt(endMin), clamped }
}
