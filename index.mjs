import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Ollama } from "@langchain/ollama";

// 1. Configuração do Modelo (Ollama rodando local)
const model = new Ollama({
  baseUrl: "http://localhost:11434",
  model: "llama3", // Certifique-se de que deu o 'ollama run llama3' antes
});

async function main() {
  console.log("--- Iniciando Leitura das Transcrições de ADS ---");

  // 2. Carregar as transcrições da sua pasta
  // Mude './transcricoes' para o nome da sua pasta de arquivos .txt
  const loader = new DirectoryLoader(
    "./transcricoes", 
    { ".txt": (path) => new TextLoader(path) },
    true // Isso faz ele entrar em todas as subpastas
  );

  try {
    const docs = await loader.load();
    console.log(`Sucesso: ${docs.length} arquivos carregados.`);

    // 3. Dividir o texto em pedaços menores (Chunks)
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });
    const splits = await splitter.splitDocuments(docs);

    // 4. Exemplo de pergunta baseada no primeiro pedaço de contexto
    // No futuro, usaremos o Vector Database para buscar o trecho exato
    const pergunta = "Faça um resumo dos principais pontos abordados nestas transcrições.";
    
    console.log("IA Processando...");
    
    // Pegando apenas os primeiros fragmentos para teste inicial
    const contextoReduzido = splits.slice(0, 3).map(d => d.pageContent).join("\n");

    const res = await model.invoke(
      `Você é um tutor de ADS. Use o contexto abaixo para responder.\n\nContexto: ${contextoReduzido}\n\nPergunta: ${pergunta}`
    );

    console.log("\n--- Resposta da sua IA ---");
    console.log(res);

  } catch (error) {
    console.error("Erro ao carregar arquivos. Verifique se o caminho da pasta está correto.", error);
  }
}

main();