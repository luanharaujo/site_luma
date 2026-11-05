# vendor/

Bibliotecas de terceiros guardadas aqui (nada de script de CDN na origem que guarda o token; CSP `script-src 'self'`).
Baixadas uma vez do cdnjs em 05/11/2026 e conferidas contra o SRI publicado pelo cdnjs (sha512 idêntico).

| Arquivo | Versão | sha384 (base64) | Origem |
|---|---|---|---|
| exceljs.min.js | 4.4.0 | Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz | https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js |
| pdf.min.js | 3.11.174 | /1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js |
| pdf.worker.min.js | 3.11.174 | SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js |

Conferir de novo: `openssl dgst -sha384 -binary ARQUIVO | openssl base64 -A`.
O pdf.js só é carregado quando alguém escolhe um PDF no "Lançar"; o ExcelJS só ao baixar o Excel.

## Pendente
- pdf.js 3.11.174 é vulnerável à CVE-2024-4367 (execução de JS por fonte maliciosa, corrigida na 4.2.67). Mitigação atual: `isEvalSupported: false` no `getDocument` (site/js/leitor.js) e CSP sem `unsafe-eval`. Subir para a 4.x exige carregar o pdf.js como módulo ES (`.mjs`) e baixar o `pdf.worker.min.mjs`; fica para uma rodada própria, com o hash anotado aqui.
