// Lê o arquivo escolhido no "Lançar": XML de NFS-e (no navegador), PDF (pdf.js, só quando precisa) ou foto (só anexa).
import { hojeIso } from './util.js?v=8dc1369de3'

const cents = (t) => { const v = parseFloat(String(t).replace(/\./g, '').replace(',', '.')); return isFinite(v) ? Math.round(v * 100) : 0 }
const centsPonto = (t) => { const s = String(t).trim(); const v = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s); return isFinite(v) ? Math.round(v * 100) : 0 }

function xmlNfse(txt) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('O XML está com defeito.')
  const pega = (raiz, nomes) => { for (const n of nomes) { const e = raiz.getElementsByTagNameNS('*', n)[0]; if (e && e.textContent.trim()) return e.textContent.trim() } return '' }
  const tom = ['TomadorServico', 'Tomador', 'toma'].map((n) => doc.getElementsByTagNameNS('*', n)[0]).find(Boolean)
  const d = pega(doc, ['DataEmissao', 'dhEmi', 'dhProc']).slice(0, 10)
  return {
    numero: pega(doc, ['nNFSe', 'NumeroNfse', 'Numero']).replace(/^0+(?=\d)/, ''),
    data: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '',
    tomador: tom ? pega(tom, ['RazaoSocial', 'xNome', 'NomeFantasia']) : '',
    valor: centsPonto(pega(doc, ['ValorServicos', 'vServ', 'ValorLiquidoNfse', 'vLiq'])),
    codigo: pega(doc, ['ItemListaServico', 'cTribNac', 'CodigoTributacaoMunicipio', 'CodigoServico']),
    desc: pega(doc, ['Discriminacao', 'xDescServ']).slice(0, 120),
  }
}

let pdfPronto = null
function carregaPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfPronto) return pdfPronto
  pdfPronto = new Promise((ok, falha) => {
    const s = document.createElement('script')
    s.src = window.ADM_CONFIG.pdfjs
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.ADM_CONFIG.pdfworker; ok(window.pdfjsLib) }
    s.onerror = () => { pdfPronto = null; falha(new Error('Não consegui carregar o leitor de PDF.')) }
    document.head.appendChild(s)
  })
  return pdfPronto
}
async function pdfTexto(arquivo) {
  const lib = await carregaPdfjs()
  const pdf = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false }).promise
  let t = ''
  for (let i = 1; i <= Math.min(2, pdf.numPages); i++) t += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n'
  return t.replace(/[ \t]+/g, ' ')
}
function lerTextoPdf(t) {
  const out = {}
  const ehNota = /NFS-?e|Nota Fiscal de Servi/i.test(t)
  const num = /N[úu]mero da (?:NFS-?e|Nota)[^\d]{0,20}(\d{1,9})/i.exec(t) || /N[úu]mero[^\d]{0,12}(\d{1,9})/i.exec(t)
  if (ehNota && num) out.numero = num[1].replace(/^0+(?=\d)/, '')
  const dt = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t)
  if (dt) out.data = `${dt[3]}-${dt[2]}-${dt[1]}`
  const tom = /Tomador[^:\n]{0,30}[:\s]+(?:Nome\/Raz[ãa]o Social[:\s]+)?([A-ZÀ-Ú0-9][^\n]{3,70}?)(?:\s+(?:CNPJ|CPF|Endere|Inscri)|\n)/i.exec(t)
  if (ehNota && tom) out.tomador = tom[1].trim()
  const vals = [...t.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => cents(m[1]))
  const tot = /Valor (?:Total )?(?:do |dos )?Servi[çc]os?[^\d]{0,20}R?\$?\s*([\d.]+,\d{2})/i.exec(t) || /\bTotal[^\d]{0,15}R?\$?\s*([\d.]+,\d{2})/i.exec(t)
  if (tot) out.valor = cents(tot[1]); else if (vals.length) out.valor = Math.max(...vals)
  const cod = /\b(\d{2}\.\d{2}(?:\.\d{2})?)\b/.exec(t)
  if (ehNota && cod) out.codigo = cod[1]
  out.tipo = ehNota ? 'nota' : /pix/i.test(t) ? 'entrada' : null
  return out
}

// Devolve { dados (campos que conseguiu preencher), aviso, lido }
export async function lerArquivo(arquivo) {
  const nome = (arquivo.name || '').toLowerCase()
  if (arquivo.type.includes('xml') || nome.endsWith('.xml')) {
    const x = xmlNfse(await arquivo.text())
    if (!x.valor) throw new Error('Não achei o valor da nota nesse XML. Digite os campos.')
    return { dados: { tipo: 'nota', numero: x.numero, data: x.data || hojeIso(), tomador: x.tomador, valor: x.valor, codigo: x.codigo, desc: x.desc || (x.tomador ? 'Serviço para ' + x.tomador : ''), de: 'luan', recebido: false }, lido: true, aviso: '' }
  }
  if (arquivo.type === 'application/pdf' || nome.endsWith('.pdf')) {
    let t
    try { t = lerTextoPdf(await pdfTexto(arquivo)) } catch (e) { return { dados: {}, lido: false, aviso: 'Não consegui ler o texto desse PDF. Digite os campos; o arquivo vai anexado.' } }
    const dados = { ...t }
    if (!dados.tipo) delete dados.tipo
    if (dados.tipo === 'nota') { dados.desc = dados.tomador ? 'Serviço para ' + dados.tomador : ''; dados.de = 'luan'; dados.recebido = false }
    return { dados, lido: !!t.valor, aviso: t.valor ? '' : 'Não achei o valor no PDF. Digite os campos.' }
  }
  return { dados: {}, lido: false, aviso: 'A leitura de foto chega depois: digite os campos, a foto vai anexada.' }
}

// iPhone manda HEIC; a API só aceita JPEG, PNG, WebP, PDF e XML.
export async function prepararAnexo(arquivo) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/xml', 'text/xml']
  const nome = (arquivo.name || 'anexo')
  if (ok.includes(arquivo.type)) return arquivo
  if (/\.xml$/i.test(nome)) return new File([arquivo], nome, { type: 'application/xml' })
  if (/\.pdf$/i.test(nome)) return new File([arquivo], nome, { type: 'application/pdf' })
  if (arquivo.type.startsWith('image/') || /\.(heic|heif)$/i.test(nome)) {
    const bmp = await createImageBitmap(arquivo)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
    return new File([blob], nome.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  }
  throw new Error('Tipo de arquivo não aceito (PDF, XML ou foto).')
}
