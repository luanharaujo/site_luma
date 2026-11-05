// The iPhone home-screen app can keep an old copy of the page. On open (and when coming back to the app) ask the
// server which version is published; if it is newer, reopen the page at a new URL so every file is fetched again.
// At most one reopen per version (no loop if the server still hands out the old page).
export async function conferirVersao() {
  const atual = (window.ADM_CONFIG && window.ADM_CONFIG.versao) || ''
  if (!atual || atual.startsWith('__')) return // local preview: not stamped
  let nova = ''
  try {
    const r = await fetch('/adm/versao.json?t=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    nova = String((await r.json()).versao || '')
  } catch (e) { return }
  if (!nova || nova === atual) return
  const chave = 'adm_reaberto_' + nova
  try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1') } catch (e) { /* sem storage: reabre uma vez mesmo assim */ }
  location.replace('/adm/?v=' + encodeURIComponent(nova) + location.hash)
}
