# Dashboard — Homens Face a Face com Deus 2026.2

Dashboard web responsivo conectado à planilha de inscrições do evento.

## Executar localmente

Use um servidor local (abrir o HTML diretamente pode bloquear alguns recursos do navegador):

```powershell
python -m http.server 4173
```

Depois, acesse `http://localhost:4173`.

## Sincronização com o Google Planilhas

A identificação da planilha e da aba está em `SHEET_CONFIG`, no início de `app.js`. O dashboard tenta consultar os dados a cada 60 segundos pelo endpoint de visualização do Google Planilhas.

O dashboard usa uma planilha auxiliar separada, com apenas os campos estatísticos. A planilha original continua privada e os campos de nome, telefone e familiares não são importados.

Para a sincronização externa funcionar, somente a planilha auxiliar deve estar configurada como **Qualquer pessoa com o link → Leitor**. A fórmula `IMPORTRANGE` mantém essa base atualizada a partir da planilha privada.

O dashboard nunca exibe nome, telefone ou contatos familiares.

## Campos utilizados

- Carimbo de data/hora
- Estado Civil
- Idade
- Qual sua igreja?
- Igreja/cidade informada para INOVI ou outra igreja
- Participação em Célula
- Batismo nas águas
- Participação anterior em Encontro com Deus
- Confirmação
