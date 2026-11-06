// Folhas (painéis que sobem) de Lançar e Retirar.
import { S } from './estado.js?v=3b99968d59'
import { ic } from './icones.js?v=3b99968d59'
import { API } from './api.js?v=3b99968d59'
import { brl, dbrl, dm, nomeMes, esc, lerReais, reaisTxt, NOME, hojeIso, soma } from './util.js?v=3b99968d59'
import { chip } from './telas.js?v=3b99968d59'

const linha = (a, b) => `<div class="linha"><span>${a}</span><span class="r">${b}</span></div>`
const cabFolha = (t, voltar) => `<div class="folha-cab">${voltar ? `<button data-acao="passo" data-p="${voltar}" aria-label="Voltar">${ic('voltar')}</button>` : ''}<h3>${t}</h3><button data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>`
const op = (k, v, t) => `<button class="op ${S.folha.dados[k] === v ? 'sel' : ''}" data-acao="campo" data-k="${k}" data-v="${v}">${t}</button>`

// Bancos da empresa onde o dinheiro pode cair (contas sem dono, contábeis, de nível alto); os ids vêm do resumo.
export const bancosEmpresa = () => (S.resumo ? S.resumo.contas.filter((c) => c.tipo === 'banco' && c.contabil === 1 && !c.pai && !c.dono) : [])
const contaReal = (d) => (d.conta === 'especie' ? 'especie' : d.contaEmp || (bancosEmpresa()[0] || {}).id || 'pj_inter')
const escolhaBanco = (d) => { const b = bancosEmpresa(); return b.length > 1 ? `<div class="campo"><label>Em que banco?</label><div class="ops">${b.map((x) => op('contaEmp', x.id, esc(x.nome))).join('')}</div></div>` : '' }
export const dadosPadrao = () => ({ tipo: 'entrada', data: hojeIso(), desc: '', valor: 0, conta: 'pj', de: 'duo', divisao: 'tercos', recebido: true, tomador: '', numero: '', codigo: '', contaEmp: '' })
export const novaFolhaLancar = () => ({ tipo: 'lancar', passo: 'origem', dados: dadosPadrao(), arquivo: null, lido: false, aviso: '', efeito: null, ocupado: false })

export function lerCampos() {
  const f = S.folha
  if (!f || !f.dados || f.tipo !== 'lancar') return
  const g = (id) => document.getElementById(id)
  if (g('f-valor')) f.dados.valor = lerReais(g('f-valor').value)
  if (g('f-desc')) f.dados.desc = g('f-desc').value
  if (g('f-tomador')) f.dados.tomador = g('f-tomador').value
  if (g('f-numero')) f.dados.numero = g('f-numero').value.trim()
  if (g('f-data') && g('f-data').value) f.dados.data = g('f-data').value
}

// Corpo do que vai para a API (o mesmo no "Ver o efeito" e no "Lançar").
// `id` só no lançamento de verdade (nf-AAAA-MM-NNN); a simulação vai sem id.
export function montaPayload(d, id) {
  if (d.tipo === 'nota') {
    const duo = d.de === 'duo'
    const n = { tomador: d.tomador || d.desc || 'Tomador', valor: d.valor, emitida_em: d.data, tipo: duo ? 'duo' : 'socio', status: 'emitida' }
    if (d.numero) n.numero = d.numero
    if (d.desc) n.descricao = d.desc
    if (d.codigo) n.codigo_servico = d.codigo
    if (!duo) n.trouxe = d.de
    if (duo) n.divisao = 'tercos'
    if (duo && d.divisao === 'tudo_caixa') n.proposta_divisao = 'tudo_caixa' // a API abre a decisão para os dois
    if (d.recebido) { n.recebida_em = d.data; n.conta_recebimento = contaReal({ ...d, conta: 'pj' }) }
    if (id) n.id = id
    return { corpo: n, notas: true }
  }
  if (d.tipo === 'entrada') return { corpo: { data: d.data, valor: Math.abs(d.valor), conta: contaReal(d), tipo: 'receita_informal', categoria: 'REC-INF', dono: 'duo', descricao: d.desc, origem: 'site' } }
  const comum = d.de === 'comum'
  return { corpo: { data: d.data, valor: -Math.abs(d.valor), conta: contaReal(d), tipo: comum ? 'despesa_comum' : 'despesa_duo', dono: comum ? 'comum' : 'duo', descricao: d.desc, origem: 'site' } }
}
export const corpoSimular = (d) => { const p = montaPayload(d); if (p.notas) delete p.corpo.proposta_divisao; return p.notas ? { notas: [p.corpo] } : { lancamentos: [p.corpo] } }

function efeitoHtml(res, d) {
  const dl = res.deltas || {}
  const lin = ['luan', 'mari', 'duo', 'a_decidir'].map((k) => (dl[k] ? linha(NOME[k], `<span class="${dl[k] > 0 ? 'mais-v' : 'menos-v'}">${dbrl(dl[k])}</span>`) : '')).join('')
  const notas = []
  const porDia = {}
  for (const x of res.reservas_novas || []) if (x && x.valor) porDia[x.vence || ''] = (porDia[x.vence || ''] || 0) + x.valor
  for (const [v, t] of Object.entries(porDia)) if (t) notas.push(`${t > 0 ? 'Imposto a guardar' : 'Imposto a menos'}: ${brl(t)}${v ? ' para o dia ' + dm(v) : ''}.`)
  for (const a of res.avisos || []) notas.push(esc(typeof a === 'string' ? a : a.texto || JSON.stringify(a)))
  if (d.tipo === 'nota') {
    if (!d.recebido) notas.push('Como o dinheiro ainda não caiu, a nota vai para Próximas entradas e o efeito acontece quando for paga.')
    notas.push('Contábil: entra no Excel do mês para o contador.')
    if (d.de === 'duo' && d.divisao === 'tudo_caixa') notas.push('Tudo no caixa precisa do voto dos dois: a nota entra dividida em 3 até lá.')
  } else if (d.tipo === 'entrada') notas.push(d.conta === 'especie' ? 'Dinheiro vivo: só financeiro, não vai ao contador.' : 'Entrou na conta da empresa sem nota: o contábil vai pedir um nome para essa entrada.')
  else notas.push(d.de === 'comum' ? 'Despesa comum: dividida pelo que cada um trouxe em notas no mês.' : 'Gasto do caixa do Duo.')
  return `<div class="efeito"><div class="linhas">${lin || '<p class="nota">Nada muda nos saldos agora.</p>'}</div>${notas.map((t) => `<p class="nota">${t}</p>`).join('')}</div>`
}

export function folhaLancar() {
  const f = S.folha, d = f.dados
  if (f.passo === 'origem') return cabFolha('Lançar') + `<div class="opcoes">
      <button class="opcao" data-acao="escolher-arq">${ic('camera')}<b>Foto, PDF ou XML</b><small>nota fiscal, comprovante de Pix, recibo</small></button>
      <button class="opcao" data-acao="digitar">${ic('lapis')}<b>Digitar</b><small>valor, o que foi e de quem é</small></button>
      <button class="opcao" data-acao="lanc-zap">${ic('zap')}<b>Pelo WhatsApp</b><small>mande o comprovante para o robô do Duo</small></button></div>
      ${f.aviso ? `<p class="erro-faixa">${esc(f.aviso)}</p>` : ''}
      <p class="nota">XML de nota é lido aqui no navegador; PDF também, quando dá. Nada entra sem vocês confirmarem.</p>`
  if (f.passo === 'zap') return cabFolha('Pelo WhatsApp', 'origem') + `<div class="zap-explica"><b>Basta mandar ao robô do Duo.</b><p class="nota">Mande a foto ou o PDF do comprovante (ou da nota) para o WhatsApp do Duo, como já faz. O robô lê, lança e a tela se atualiza na próxima vez que você voltar para ela. O que ele não tiver certeza aparece em "Para decidir".</p></div><div class="btns"><button class="btn" data-acao="fechar">Entendi</button></div>`
  if (f.passo === 'lendo') return cabFolha('Lendo o documento') + '<p class="carregando">Procurando valor, data e número da nota…</p>'
  if (f.passo === 'campos') {
    const lido = f.lido ? '<span class="lido">lido do documento</span>' : ''
    let cls = ''
    if (d.tipo === 'nota') cls = `<div class="campo"><label for="f-tomador">Tomador ${lido}</label><input id="f-tomador" value="${esc(d.tomador)}"></div><div class="campo"><label for="f-numero">Número da nota ${lido}</label><input id="f-numero" inputmode="numeric" value="${esc(d.numero)}"></div>
      <div class="campo"><label>De quem é esta nota?</label><div class="ops">${op('de', 'luan', 'Luan (trabalho dele)')}${op('de', 'mari', 'Mari (trabalho dela)')}${op('de', 'duo', 'Duo LuMa (artística)')}</div></div>`
      + (d.de === 'duo' ? `<div class="campo"><label>Divisão</label><div class="ops">${op('divisao', 'tercos', '1/3 cada')}${op('divisao', 'tudo_caixa', 'Tudo no caixa (precisa dos dois)')}</div></div>` : '')
      + `<div class="campo"><label>O dinheiro já caiu?</label><div class="ops">${op('recebido', true, 'Sim, na conta da empresa')}${op('recebido', false, 'Ainda não')}</div></div>${d.recebido ? escolhaBanco(d) : ''}`
    else if (d.tipo === 'entrada') cls = `<div class="campo"><label>Onde caiu?</label><div class="ops">${op('conta', 'pj', 'Conta da empresa')}${op('conta', 'especie', 'Dinheiro vivo')}</div></div>${d.conta === 'pj' ? escolhaBanco(d) : ''}<p class="nota">Entrada sem nota é do caixa do Duo.</p>`
    else cls = `<div class="campo"><label>De quem é o gasto?</label><div class="ops">${op('de', 'duo', 'Caixa do Duo')}${op('de', 'comum', 'Despesa da empresa')}</div></div><div class="campo"><label>Pago com</label><div class="ops">${op('conta', 'especie', 'Dinheiro vivo')}${op('conta', 'pj', 'Conta da empresa')}</div></div>${d.conta === 'pj' ? escolhaBanco(d) : ''}`
    const tipoSel = `<div class="campo"><label>O que é?</label><div class="ops">${op('tipo', 'entrada', 'Entrada sem nota')}${op('tipo', 'saida', 'Saída')}${op('tipo', 'nota', 'Nota fiscal')}</div></div>`
    return cabFolha('Confira', 'origem') + (f.arquivo ? `<div class="arq-info">${ic('clip')}<span>${esc(f.arquivo.name)} vai anexado</span></div>` : '') + (f.aviso ? `<p class="nota">${esc(f.aviso)}</p>` : '') + tipoSel
      + `<div class="campo"><label for="f-valor">Valor ${lido}</label><input id="f-valor" inputmode="decimal" value="${reaisTxt(d.valor || 0)}"></div>
      <div class="campo"><label for="f-desc">Descrição ${lido}</label><input id="f-desc" value="${esc(d.desc || '')}"></div>
      <div class="campo"><label for="f-data">Data ${lido}</label><input id="f-data" type="date" value="${esc(d.data)}"></div>${cls}
      <div class="btns"><button class="btn pri" data-acao="efeito">Ver o efeito</button></div>`
  }
  if (f.passo === 'efeito') {
    if (!f.efeito) return cabFolha('Efeito no dinheiro', 'campos') + '<p class="carregando">Calculando o efeito…</p>'
    return cabFolha('Efeito no dinheiro', 'campos') + `<p><b>${esc(d.desc || d.tomador)}</b> · <span class="num">${brl(d.valor)}</span></p>` + efeitoHtml(f.efeito, d)
      + `<div class="btns"><button class="btn pri" data-acao="confirmar" ${f.ocupado ? 'disabled' : ''}>${f.ocupado ? 'Lançando…' : 'Lançar'}</button><button class="btn" data-acao="passo" data-p="campos">Corrigir</button></div>`
  }
  return ''
}

export function folhaRetirar() {
  const f = S.folha, p = f.pessoa, r = S.resumo
  const pend = pendentesDe(p).filter((x) => x.tipo === 'prolabore')
  const max = (r.donos[p] && r.donos[p].pode_tirar_hoje) || 0
  const card = (x, i) => `<div class="pix"><div class="topo-pix"><b>Pix ${i + 1} · Pró-labore de ${nomeMes(x.competencia)}</b>${chip('info', 'pró-labore')}</div><span class="val">${brl(x.valor)}</span>
    <div class="btns"><button class="btn mini" data-acao="copiar" data-v="${reaisTxt(x.valor)}">${ic('copiar')} Copiar valor</button><button class="btn mini pri" data-acao="retirei" data-i="${i}" ${f.ocupado ? 'disabled' : ''}>Já fiz o Pix</button></div></div>`
  const lucro = `<div class="pix"><div class="topo-pix"><b>Pix ${pend.length + 1} · Lucro</b>${chip('ok', 'lucro')}</div>
    ${max > 0 ? `<div class="campo"><label for="f-lucro">Quanto vai tirar de lucro (até ${brl(max)})</label><input id="f-lucro" inputmode="decimal" value="${reaisTxt(max)}"></div>
    <div class="btns"><button class="btn mini" data-acao="copiar-lucro">${ic('copiar')} Copiar valor</button><button class="btn mini pri" data-acao="retirei-lucro" ${f.ocupado ? 'disabled' : ''}>Já fiz o Pix de lucro</button></div>` : '<p class="nota">Nada de lucro para tirar hoje.</p>'}</div>`
  return cabFolha('Retirar') + `<div class="ops">${['luan', 'mari'].map((q) => `<button class="op ${q === p ? 'sel' : ''}" data-acao="ret-pessoa" data-p="${q}">${NOME[q]}</button>`).join('')}</div>
    ${pend.map(card).join('')}${lucro}
    <p class="nota">Pró-labore e lucro sempre em Pix separados: o contador precisa ver os dois. O pró-labore já vem sem o INSS, que fica guardado para o dia 20. O máximo de lucro é o que pode sair hoje sem mexer no dinheiro guardado.</p>`
}
export const pendentesDe = (p) => (S.resumo.pendentes_retirada || []).filter((x) => x.socio === p)
