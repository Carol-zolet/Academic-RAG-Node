import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const tokens = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
oauth2Client.setCredentials(tokens);

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function extrairTexto(fileId) {
  try {
    console.log(`\n--- 📄 AGENTE EXTRATOR: Baixando conteúdo do arquivo ---`);
    
    // Faz o download do conteúdo do arquivo
    const res = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    });

    console.log("✅ Conteúdo extraído com sucesso!");
    console.log("\n--- INÍCIO DO TEXTO ---");
    console.log(res.data);
    console.log("--- FIM DO TEXTO ---");

    return res.data;
  } catch (error) {
    console.error("❌ Erro ao extrair texto:", error.message);
  }
}

// TESTE: Vamos tentar ler o Plano de Ensino (ou qualquer arquivo .txt que você tenha)
// Nota: Se for PDF, a extração direta via 'media' traz o binário. 
// O ideal para o RAG são arquivos .txt, .md ou .csv.
const ID_ARQUIVO_TESTE = "1swhaJHmV7BM3qeAlkATIsDmv8GefuGef"; // ID do Plano de Ensino
extrairTexto(ID_ARQUIVO_TESTE);
