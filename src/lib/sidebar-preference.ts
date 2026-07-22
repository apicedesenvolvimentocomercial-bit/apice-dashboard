/**
 * Preferência de estado do menu lateral da clínica (recolhido × expandido).
 *
 * Vive no localStorage — mesma natureza da preferência de tema (next-themes):
 * é do DISPOSITIVO, não do usuário no banco, então não há action/coluna. A
 * chave é lida DEPOIS da montagem (o SSR sempre renderiza expandido; ler no
 * initializer do useState quebraria a hidratação).
 *
 * Dois pontos escrevem nela — o botão da borda da sidebar e o seletor da seção
 * Aparência — e ambos precisam ver a mudança do outro na hora. O evento de
 * `storage` só dispara em OUTRAS abas, por isso o `CustomEvent` próprio.
 */

export const SIDEBAR_COLLAPSED_KEY = 'senno:clinic-sidebar-collapsed'

const SIDEBAR_COLLAPSED_EVENT = 'senno:clinic-sidebar-collapsed-change'

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

/** Persiste e avisa quem estiver ouvindo na MESMA aba (sidebar ↔ Aparência). */
export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  window.dispatchEvent(new CustomEvent<boolean>(SIDEBAR_COLLAPSED_EVENT, { detail: collapsed }))
}

export function subscribeSidebarCollapsed(listener: (collapsed: boolean) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<boolean>).detail)
  window.addEventListener(SIDEBAR_COLLAPSED_EVENT, handler)
  return () => window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, handler)
}
