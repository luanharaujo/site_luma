// Aba Ideias: fila de ideias e pedidos de mudança do site (contrato em api/IDEIAS.md).
// Este arquivo desenha a tela e a folha de "Nova ideia" e entrega as ações; app.js só liga as peças (acoesIdeias).
import { S } from './estado.js?v=3b99968d59'
import { ic } from './icones.js?v=3b99968d59'
import { esc } from './util.js?v=3b99968d59'

const NIVEIS = [
  ['bug_critico', 'Bug crítico', 'bad'], ['bug', 'Bug', 'warn'], ['feature_urgente', 'Feature urgente', 'warn'],
  ['feature_importante', 'Feature importante', 'info'], ['feature_quando_der', 'Feature quando der', 'neutro'], ['so_registro', 'Só registro', 'neutro'],
]
const NIVEL = Object.fromEntries(NIVEIS.map(([k, t, c]) => [k, { t, c }]))
const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`
const dtCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')
const dtHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const corta = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }
const tituloDe = (i) => esc(i.titulo || corta(i.texto, 70) || 'Sem texto')
const ehLuan = () => S.eu === 'luan'
const rasc = (k) => (S.rasc && S.rasc[k]) || ''

// Texto com blocos entre ``` : o que está dentro vira bloco copiável.
function partes(texto) {
  const out = []
  String(texto || '').split(/```/).forEach((seg, k) => { if (k % 2 === 1) out.push({ codigo: seg.replace(/^\w*\n/, '').replace(/^\n+|\n+$/g, '') }); else if (seg.trim()) out.push({ texto: seg.trim() }) })
  return out
}
const textoHtml = (t) => esc(t).replace(/\n/g, '<br>')

/* ===== tela ===== */
function caixaEspera(lista) {
  const itens = lista.filter((i) => i.espera_luan)
  if (!itens.length) return ''
  return `<section class="espera-luan" aria-label="Esperando o Luan"><h2>${ic('alerta')} Esperando o Luan</h2>${itens.map((i) => {
    const corpo = partes(i.espera_luan).map((p) => (p.codigo != null
      ? `<div class="cod"><pre>${esc(p.codigo)}</pre><button class="btn mini" data-acao="ideia-copiar" data-v="${esc(p.codigo)}">${ic('copiar')} Copiar</button></div>`
      : `<p>${textoHtml(p.texto)}</p>`)).join('')
    return `<div class="espera-item"><b>${tituloDe(i)}</b>${corpo}<div class="btns"><button class="btn mini pri" data-acao="ideia-ja-fiz" data-id="${esc(i.id)}">Já fiz</button></div></div>`
  }).join('')}</section>`
}

function cartao(i, secao) {
  const aberta = S.ideiaAberta === i.id
  const nv = NIVEL[i.nivel] || { t: esc(i.nivel || ''), c: 'neutro' }
  const meta = [chip(nv.c, nv.t), i.regra_dinheiro ? chip('bad', 'Regra de dinheiro') : '', i.agente_trabalhando ? chip('info', 'Agente trabalhando') : '', `<span class="ideia-quem">${esc(i.autor || '')} · ${esc(dtCurta(i.criado_em))}</span>`].join('')
  const dinheiroBloq = i.regra_dinheiro && !ehLuan()
  // money card whose OK went away (comment after the approval, Security I3): out of the agent's queue until Luan signs again
  const semOk = i.regra_dinheiro && !i.aprovada_por_luan && (secao === 'avaliar' || secao === 'fila')
  const aviso = semOk ? `<p class="nota">Regra de dinheiro sem o OK do Luan: fora da fila do agente.${ehLuan() ? '' : ' Só o Luan manda de volta, com Face ID.'}</p>` : dinheiroBloq ? '<p class="nota">Só o Luan aprova, com Face ID.</p>' : ''
  const deVolta = semOk && ehLuan() ? `<button class="btn mini pri" data-acao="ideia-mandar" data-id="${esc(i.id)}">Mandar de volta (Face ID)</button>` : ''
  let acoes = ''
  if (secao === 'avaliar') acoes = `<button class="btn mini pri" data-acao="ideia-aprovar" data-id="${esc(i.id)}">Aprovar</button><button class="btn mini" data-acao="ideia-comentando" data-id="${esc(i.id)}">Comentar</button>${deVolta}`
  else if (secao === 'fila') acoes = deVolta || `<button class="op ${i.agora ? 'sel' : ''}" aria-pressed="${i.agora ? 'true' : 'false'}" data-acao="ideia-agora" data-id="${esc(i.id)}" data-ativo="${i.agora ? '0' : '1'}"${dinheiroBloq && !i.agora ? ' disabled' : ''}>${i.agora ? 'Implementar agora: ligado' : 'Implementar agora'}</button>`
  else if (secao === 'ideias') acoes = `<button class="btn mini pri" data-acao="ideia-mandar" data-id="${esc(i.id)}"${dinheiroBloq ? ' disabled' : ''}>Mandar implementar</button>`
  const comentando = S.comentando === i.id
  const caixaCom = comentando ? `<div class="campo"><label for="com-${esc(i.id)}">Seu comentário</label><textarea id="com-${esc(i.id)}" rows="3" data-rasc="c${esc(i.id)}">${esc(rasc('c' + i.id))}</textarea><p class="nota">Comentar devolve a ideia para a fila do agente.</p><div class="btns"><button class="btn mini pri" data-acao="ideia-comentar" data-id="${esc(i.id)}">Enviar comentário</button><button class="btn mini" data-acao="ideia-comentando" data-id="${esc(i.id)}">Cancelar</button></div></div>` : ''
  let detalhe = ''
  if (aberta) {
    const coms = (i.comentarios || []).map((c) => `<div class="ideia-com"><b>${esc(c.autor)}</b> <span class="nota">${esc(dtHora(c.criado_em))}</span><p>${textoHtml(c.texto)}</p></div>`).join('')
    const hist = (i.historico || []).map((h) => `<li>${esc(h.de || 'novo')} → ${esc(h.para)} · ${esc(h.por)} · ${esc(dtHora(h.em))}</li>`).join('')
    const arq = S.confArq === i.id
    detalhe = `<div class="ideia-det">
      <div class="ideia-texto">${partes(i.texto).map((p) => (p.codigo != null ? `<div class="cod"><pre>${esc(p.codigo)}</pre><button class="btn mini" data-acao="ideia-copiar" data-v="${esc(p.codigo)}">${ic('copiar')} Copiar</button></div>` : `<p>${textoHtml(p.texto)}</p>`)).join('')}</div>
      ${i.resumo ? `<p class="nota"><b>Resumo do agente:</b> ${textoHtml(i.resumo)}</p>` : ''}
      ${coms ? `<div class="ideia-coms"><h4>Comentários</h4>${coms}</div>` : ''}
      <div class="campo"><label>Nível</label><div class="ops">${NIVEIS.map(([k, t]) => `<button class="op ${i.nivel === k ? 'sel' : ''}" data-acao="ideia-nivel" data-id="${esc(i.id)}" data-n="${k}">${t}</button>`).join('')}</div></div>
      <div class="btns">${i.status === 'ideia' ? `<button class="btn mini" data-acao="ideia-editar" data-id="${esc(i.id)}">${ic('lapis')} Editar texto</button>` : ''}<button class="btn mini" data-acao="ideia-arquivar" data-id="${esc(i.id)}">${arq ? 'Toque de novo para arquivar' : 'Arquivar'}</button></div>
      ${hist ? `<details class="ideia-hist"><summary>Histórico</summary><ul>${hist}</ul></details>` : ''}
    </div>`
  }
  return `<article class="ideia${aberta ? ' aberta' : ''}"><button class="ideia-topo" data-acao="ideia-abre" data-id="${esc(i.id)}" aria-expanded="${aberta}"><span class="ideia-tit">${tituloDe(i)}</span><span class="ideia-meta">${meta}</span></button>
    ${acoes ? `<div class="ideia-acoes">${acoes}</div>` : ''}${aviso}${caixaCom}${detalhe}</article>`
}

const secaoI = (titulo, lista, k, extra) => (lista.length ? `<section class="sec"><div class="sec-cab"><h2>${titulo}</h2><span class="nota">${lista.length}</span></div><div class="ideias-lista">${lista.map((i) => cartao(i, k)).join('')}</div>${extra || ''}</section>` : '')

export function telaIdeias() {
  const nova = `<div class="btns"><button class="btn pri" data-acao="ideia-nova">${ic('mais')} Nova ideia</button></div>`
  if (!S.ideias) return nova + (S.erroIdeias ? `<p class="erro-faixa">${esc(S.erroIdeias)}</p>` : '<p class="carregando">Carregando as ideias…</p>')
  const todas = S.ideias.filter((i) => i.status !== 'arquivada')
  const por = (st) => todas.filter((i) => i.status === st)
  const feitas = por('feito')
  const feitasHtml = feitas.length ? `<section class="sec"><div class="sec-cab"><h2>Feitas</h2><button class="acao" data-acao="ideia-feitas" aria-expanded="${!!S.feitasAbertas}">${S.feitasAbertas ? 'Esconder' : 'Mostrar'} (${feitas.length})</button></div>${S.feitasAbertas ? `<div class="ideias-lista">${feitas.map((i) => cartao(i, 'feitas')).join('')}</div>` : ''}</section>` : ''
  const vazio = !todas.length ? '<section class="sec"><p>Nenhuma ideia ainda.</p><p class="nota">Toque em "Nova ideia" para registrar um bug ou um pedido de mudança no site.</p></section>' : ''
  return nova + (S.erroIdeias ? `<p class="erro-faixa">${esc(S.erroIdeias)}</p>` : '') + caixaEspera(todas) + vazio
    + secaoI('Para avaliar', por('para avaliar'), 'avaliar', '<p class="nota">O agente terminou e já está no ar. Aprove ou comente: comentar devolve para a fila dele.</p>')
    + secaoI('Fila do agente', por('a implementar'), 'fila') + secaoI('Ideias', por('ideia'), 'ideias') + feitasHtml
}

/* ===== folha: nova ideia / editar texto ===== */
export function folhaIdeia() {
  const f = S.folha, d = f.dados
  const cab = (t) => `<div class="folha-cab"><h3>${t}</h3><button data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>`
  if (f.passo === 'editar') return cab('Editar texto') + `<div class="campo"><label for="ideia-texto">Texto</label><textarea id="ideia-texto" rows="6" data-rasc="nova">${esc(rasc('nova'))}</textarea></div>
    <div class="btns"><button class="btn pri" data-acao="ideia-salvar-texto" ${f.ocupado ? 'disabled' : ''}>${f.ocupado ? 'Salvando…' : 'Salvar'}</button></div>`
  return cab('Nova ideia') + `<div class="campo"><label for="ideia-texto">O que você quer?</label><textarea id="ideia-texto" rows="6" data-rasc="nova" placeholder="Descreva o bug ou a mudança, com o que você viu ou espera">${esc(rasc('nova'))}</textarea></div>
    <div class="campo"><label>Nível</label><div class="ops">${NIVEIS.map(([k, t]) => `<button class="op ${d.nivel === k ? 'sel' : ''}" data-acao="ideia-n" data-n="${k}">${t}</button>`).join('')}</div></div>
    <label class="caixa"><input type="checkbox" data-acao="ideia-regra" ${d.regra ? 'checked' : ''}><span>Mexe em regra de dinheiro (só o Luan aprova)</span></label>
    ${f.aviso ? `<p class="erro-faixa">${esc(f.aviso)}</p>` : ''}
    <div class="btns"><button class="btn" data-acao="ideia-salvar" data-st="ideia" ${f.ocupado ? 'disabled' : ''}>Guardar como ideia</button><button class="btn pri" data-acao="ideia-salvar" data-st="a implementar" ${f.ocupado ? 'disabled' : ''}>Mandar implementar</button></div>
    <p class="nota">"Guardar" só registra. "Mandar implementar" põe na fila do agente${d.regra ? '; regra de dinheiro só vai para a fila com o Face ID do Luan' : ''}.</p>`
}

/* ===== ações (ligadas em app.js) ===== */
// c = { render, toast, escreve, aoMudar, abrirAprovacao, msgErro, tratarLogin, API }
export function acoesIdeias(c) {
  const { API } = c
  const solta = () => { const a = document.activeElement; if (a && a.blur && /^(TEXTAREA|INPUT)$/.test(a.tagName)) a.blur() }
  const acha = (id) => (S.ideias || []).find((x) => String(x.id) === String(id))
  const refaz = () => { solta(); c.render() }
  const move = (id, corpo, ok) => c.escreve(() => API.moveIdeia(id, corpo), ok)
  // regra de dinheiro: só o Luan, com o Face ID ligado a esta ideia (proposito ideia:<id>); o texto assinado o servidor monta
  const comFaceId = (id, fn) => c.abrirAprovacao(`ideia:${id}`, null, async (ap) => { S.folha = null; await fn(ap) })
  return {
    'ideia-nova': () => { S.rasc = { ...(S.rasc || {}), nova: '' }; S.folha = { tipo: 'ideia', passo: 'nova', dados: { nivel: 'feature_quando_der', regra: false }, ocupado: false, aviso: '' }; c.render() },
    'ideia-n': (d) => { S.folha.dados.nivel = d.n; refaz() },
    'ideia-regra': () => { S.folha.dados.regra = !S.folha.dados.regra; refaz() },
    'ideia-salvar': async (d) => {
      const f = S.folha; if (!f || f.ocupado) return
      const texto = rasc('nova').trim()
      if (!texto) { f.aviso = 'Escreva o que você quer antes de guardar.'; return refaz() }
      f.aviso = ''; f.ocupado = true; refaz()
      try {
        const r = await API.criaIdeia({ texto, nivel: f.dados.nivel, status: d.st, regra_dinheiro: !!f.dados.regra })
        S.folha = null; S.rasc.nova = ''
        await c.aoMudar('escrita')
        const i = r && r.ideia
        if (d.st === 'a implementar' && i && i.status === 'ideia') c.toast('Ficou como ideia: regra de dinheiro só vai com o Face ID do Luan.')
        else c.toast(d.st === 'a implementar' ? 'Na fila do agente.' : 'Ideia guardada.')
      } catch (e) { if (c.tratarLogin(e)) return; f.ocupado = false; c.toast(c.msgErro(e), true); refaz() }
    },
    'ideia-abre': (d) => { S.ideiaAberta = S.ideiaAberta === d.id ? null : d.id; S.confArq = null; refaz() },
    'ideia-nivel': (d) => c.escreve(() => API.editaIdeia(d.id, { nivel: d.n }), 'Nível atualizado.'),
    'ideia-editar': (d) => { const i = acha(d.id); if (!i) return; S.rasc = { ...(S.rasc || {}), nova: i.texto || '' }; S.folha = { tipo: 'ideia', passo: 'editar', id: d.id, dados: {}, ocupado: false }; c.render() },
    'ideia-salvar-texto': async () => {
      const f = S.folha; if (!f || f.ocupado) return
      const texto = rasc('nova').trim()
      if (!texto) return c.toast('O texto não pode ficar vazio.', true)
      f.ocupado = true; refaz()
      try { await API.editaIdeia(f.id, { texto }); S.folha = null; await c.aoMudar('escrita'); c.toast('Texto salvo.') } catch (e) { if (c.tratarLogin(e)) return; f.ocupado = false; c.toast(c.msgErro(e), true); refaz() }
    },
    'ideia-mandar': (d) => {
      const i = acha(d.id); if (!i) return
      if (i.regra_dinheiro) { if (!ehLuan()) return c.toast('Só o Luan aprova regra de dinheiro, com Face ID.', true); return comFaceId(d.id, (ap) => move(d.id, { status: 'a implementar', aprovacao: ap }, 'Na fila do agente, aprovado com Face ID.')) }
      return move(d.id, { status: 'a implementar' }, 'Na fila do agente.')
    },
    'ideia-agora': (d) => {
      const i = acha(d.id); if (!i) return
      const ativo = d.ativo === '1'
      // a money card in the queue already has Luan's OK (the server refuses otherwise); the mark only changes the order
      return c.escreve(() => API.agoraIdeia(d.id, { ativo }), ativo ? 'O agente pega esta primeiro.' : 'Voltou à ordem normal.')
    },
    'ideia-aprovar': (d) => move(d.id, { status: 'feito' }, 'Aprovada: foi para Feitas.'),
    'ideia-comentando': (d) => { S.comentando = S.comentando === d.id ? null : d.id; refaz() },
    'ideia-comentar': async (d) => {
      const t = rasc('c' + d.id).trim()
      if (!t) return c.toast('Escreva o comentário.', true)
      solta()
      const r = await c.escreve(() => API.comentaIdeia(d.id, t), null)
      if (r) { S.rasc['c' + d.id] = ''; S.comentando = null; c.render(); c.toast('Comentário enviado. A ideia voltou para a fila do agente.') }
    },
    'ideia-arquivar': (d) => {
      if (S.confArq !== d.id) { S.confArq = d.id; return refaz() }
      S.confArq = null; S.ideiaAberta = null
      return move(d.id, { status: 'arquivada' }, 'Ideia arquivada.')
    },
    'ideia-feitas': () => { S.feitasAbertas = !S.feitasAbertas; refaz() },
    'ideia-ja-fiz': (d) => c.escreve(() => API.jaFizIdeia(d.id), 'Anotado: o agente vê que você fez.'),
    'ideia-copiar': (d) => { const ok = () => c.toast('Texto copiado.'); try { navigator.clipboard.writeText(d.v).then(ok, () => c.toast('Não consegui copiar. Segure e copie o texto.', true)) } catch (e) { c.toast('Não consegui copiar. Segure e copie o texto.', true) } },
  }
}

// Guarda o que a pessoa digita nos campos de ideia (rascunho em memória), para a tela poder se redesenhar sem perder o texto.
export function ligarRascunhos(raiz) {
  raiz.addEventListener('input', (e) => { const k = e.target && e.target.dataset && e.target.dataset.rasc; if (k) { S.rasc = S.rasc || {}; S.rasc[k] = e.target.value } })
}
