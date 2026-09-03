# Oficina — Criador de Aplicativos com IA

Gera um mini-aplicativo web completo (HTML + CSS + JS num único arquivo) a
partir de uma descrição em português, usando a API do Gemini com rotação
automática entre várias chaves (se uma esgotar a cota, ele troca sozinho
para a próxima).

## O que foi corrigido/adicionado em relação à versão original

- **Chave de API não fica mais no código** — antes o arquivo tinha as
  chaves escritas direto nele, o que é perigoso ao subir para o GitHub
  (qualquer pessoa vê e usa sua chave). Agora elas ficam em `.env`, que o
  Git ignora.
- **Modelo atualizado** — o script original usava `gemini-1.5-flash`, que a
  Google já desativou (a chamada retornava erro). Agora usa
  `gemini-2.5-flash` por padrão, configurável em `.env` para o dia em que a
  Google trocar de novo.
- **Extração de código mais confiável** — antes só removia ```` ```html ````
  com um replace simples, o que quebrava se a IA respondesse com texto
  junto. Agora tenta várias estratégias antes de desistir.
- **Retry e timeout de verdade** — trata erro 429 (cota), 403 (permissão),
  5xx (instabilidade do Google) e timeout de rede, girando entre as chaves.
- **Modo de ajuste (refinar)** — depois de gerar o app, dá pra pedir um
  ajuste específico ("deixar o botão maior", "mudar pra tema claro") sem
  reescrever o pedido do zero; a IA recebe o código atual e só modifica o
  necessário.
- **Prévia responsiva** — botões para ver o app como desktop, tablet ou
  celular dentro da própria página.
- **Baixar e copiar o código** — exporta o `.html` gerado para usar fora
  dali.
- **Histórico da sessão** — clique em qualquer geração anterior para
  voltar a ela.
- **`package.json`, `.gitignore` e este README** — não existiam antes.

## Passo a passo para rodar hoje

### 1. Pré-requisito
Instale o [Node.js](https://nodejs.org) versão 18 ou mais recente.

### 2. Baixe suas chaves do Gemini
Crie (ou pegue) suas chaves em https://aistudio.google.com/apikey — pode
usar mais de uma chave para ter mais cota disponível.

### 3. Instale e configure
```bash
cd app-builder
npm install
cp .env.example .env
```
Abra o arquivo `.env` e cole suas chaves reais em `GEMINI_API_KEYS`,
separadas por vírgula, sem espaço:
```
GEMINI_API_KEYS=AIzaSy...chave1,AIzaSy...chave2
```

Também é possível usar `GEMINI_API_KEY_1` até `GEMINI_API_KEY_10`. O sistema
remove chaves repetidas e tenta a próxima automaticamente quando uma falha.

PDFs com texto, DOCX, planilhas e arquivos de código são lidos antes da
geração. PDF escaneado, imagem, áudio e vídeo ainda precisam de OCR,
transcrição ou análise multimodal para serem interpretados.

### 4. Rode
```bash
npm start
```
Abra **http://localhost:3000** no navegador.

## Como subir para o GitHub sem vazar suas chaves

O `.gitignore` já está configurado para excluir `.env` e `node_modules`.
Isso significa que, ao subir, **só o `.env.example` (com placeholders) vai
junto — nunca suas chaves reais.**

```bash
cd app-builder
git init
git add .
git commit -m "Primeira versão da Oficina"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Depois, em qualquer outro computador (ou para outra pessoa rodar seu
projeto), o processo é: clonar, `npm install`, criar o próprio `.env` com
as próprias chaves, `npm start`.

## Limitações importantes (leia antes de anunciar como "o melhor do mundo")

Vale ser honesto sobre o que essa ferramenta é e não é:

- Ela gera **um app estático de página única** (HTML/CSS/JS), ótimo para
  protótipos, ferramentas simples, calculadoras, jogos leves, formulários,
  landing pages interativas. Ela **não** gera apps com backend, banco de
  dados persistente entre sessões, autenticação real ou múltiplas telas
  roteadas — isso exigiria uma arquitetura bem maior.
- A qualidade da "primeira rodada" depende diretamente de quão detalhado é
  o seu pedido. Pedidos vagos geram apps genéricos; pedidos específicos
  (funcionalidades, tom visual, exemplos de conteúdo) geram muito melhor.
  Por isso o campo de ajuste existe — é raro acertar 100% na primeira vez
  mesmo com boas ferramentas comerciais.
- O modelo padrão (`gemini-2.5-flash`) tem um limite de tokens de saída, então
  pedidos muito complexos podem gerar um app truncado. Se isso acontecer,
  peça o ajuste "continue de onde parou" ou simplifique o pedido.
- Ferramentas como Lovable/v0/Bolt têm equipes inteiras, infraestrutura de
  deploy automático e meses de ajuste fino de prompt — não é realista (nem
  necessário) prometer que este script de ~600 linhas as supera. O que dá
  para prometer com honestidade: é seu, roda local, você entende cada linha,
  e pode evoluir do seu jeito.

## Próximos passos possíveis (se quiser evoluir)

- Trocar o Blob local por deploy automático (ex: publicar o HTML gerado
  como GitHub Pages a cada geração).
- Adicionar geração de imagens (Nano Banana / Gemini Image) para apps que
  precisem de ilustrações.
- Salvar o histórico em disco (arquivo `.json`) em vez de só na memória do
  navegador, para persistir entre sessões.
