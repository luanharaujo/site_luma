// Estado único da página. Nada daqui é guardado no navegador; vem da API a cada carga.
import { hojeIso } from './util.js?v=8dc1369de3'
export const S = {
  fase: 'carregando', // carregando | ok | restrito | proibido | erro
  eu: null, apelido: '',
  tela: 'inicio',
  resumo: null, decisoes: [], eventos: [], lancMes: [], livro: null, notas: [], mesDados: null, excel: null, cert: null,
  filtro: { mes: 'aberto', tipo: 'tudo' },
  contMes: null, excelMes: null, excelAba: 'fluxo', excelGerado: null,
  folha: null, destaque: null, erroTela: '', atualizadoEm: null, hoje: hojeIso(),
}
