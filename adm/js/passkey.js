// Passkey (Face ID / Touch ID) no navegador: só converte o que a API manda para navigator.credentials e a resposta de volta para JSON.
// Quem decide e confere tudo é o adm-api (desafio, origem, rpId, assinatura).
const paraBuf = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer }
const deBuf = (b) => { const u = new Uint8Array(b); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }

export const suportaPasskey = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && navigator.credentials.get)
// Modo preenchimento automático (WebAuthn mediation "conditional"): a passkey aparece acima do teclado e vai direto ao Face ID, sem a
// folha do sistema que o modo normal mostra antes ("Usar a chave-senha...? Continuar").
export async function suportaPreenchimento() {
  try { return !!(window.PublicKeyCredential && PublicKeyCredential.isConditionalMediationAvailable && (await PublicKeyCredential.isConditionalMediationAvailable())) } catch (e) { return false }
}

export async function criarPasskey(o) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: paraBuf(o.challenge), rp: o.rp, user: { ...o.user, id: paraBuf(o.user.id) }, pubKeyCredParams: o.pubKeyCredParams,
    authenticatorSelection: o.authenticatorSelection, attestation: o.attestation, timeout: o.timeout,
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ type: 'public-key', id: paraBuf(c.id) })),
  } })
  const r = cred.response
  const chave = r.getPublicKey ? r.getPublicKey() : null
  if (!chave || !r.getAuthenticatorData) throw new Error('Este navegador não entrega a chave do Face ID. Atualize o Safari ou o Chrome.')
  return { id: cred.id, clientDataJSON: deBuf(r.clientDataJSON), authenticatorData: deBuf(r.getAuthenticatorData()), publicKey: deBuf(chave), publicKeyAlgorithm: r.getPublicKeyAlgorithm() }
}

// condicional: pedido no modo preenchimento automático (fica aberto até a pessoa escolher a passkey no teclado ou o signal abortar).
// Sem ele, chame direto do toque (no iPhone o Face ID precisa nascer do gesto).
export async function usarPasskey(o, { condicional = false, signal } = {}) {
  const publicKey = {
    challenge: paraBuf(o.challenge), rpId: o.rpId, userVerification: o.userVerification,
    allowCredentials: condicional ? [] : (o.allowCredentials || []).map((c) => ({ type: 'public-key', id: paraBuf(c.id) })),
  }
  if (!condicional) publicKey.timeout = o.timeout
  const cred = await navigator.credentials.get(condicional ? { publicKey, mediation: 'conditional', signal } : { publicKey })
  const r = cred.response
  return { id: cred.id, clientDataJSON: deBuf(r.clientDataJSON), authenticatorData: deBuf(r.authenticatorData), signature: deBuf(r.signature), userHandle: r.userHandle ? deBuf(r.userHandle) : null }
}

// Mensagem curta para os erros do próprio navegador (o usuário cancelou, o tempo acabou, já cadastrado neste aparelho).
export function erroPasskey(e) {
  if (!e) return 'Não deu certo. Tente de novo.'
  if (e.name === 'NotAllowedError') return 'Face ID cancelado ou o tempo acabou. Toque de novo.'
  if (e.name === 'InvalidStateError') return 'Este aparelho já tem o Face ID do financeiro cadastrado.'
  if (e.name === 'SecurityError') return 'Este endereço não pode usar Face ID.'
  return e.message || 'Não deu certo. Tente de novo.'
}
