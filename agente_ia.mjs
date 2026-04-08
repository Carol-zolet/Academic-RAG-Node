import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// CONFIGURAÇÃO DA IA - Usando o nome EXATO da sua lista
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const tokens = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
oauth2Client.setCredentials(tokens);
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function estudarAula(aulaFolderId, pergunta) {
  try {
    console.log("--- 🧠 Agente IA 2.5: Iniciando análise acadêmica ---");

    // 1. Navegação nas pastas
    const subpasta = await drive.files.list({
      q: `'${aulaFolderId}' in parents and name = 'Transcricoes'`,
      fields: 'files(id, name)'
    });

    if (subpasta.data.files.length === 0) {
      console.log("❌ Pasta 'Transcricoes' não encontrada.");
      return;
    }

    const transId = subpasta.data.files[0].id;

    // 2. Busca o arquivo de texto
    const arquivos = await drive.files.list({
      q: `'${transId}' in parents and (mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.document')`,
      fields: 'files(id, name, mimeType)'
    });

    if (arquivos.data.files.length === 0) {
      console.log("❌ Nenhum arquivo de aula encontrado.");
      return;
    }

    const file = arquivos.data.files[0];
    console.log(`📖 Lendo agora: ${file.name}`);

    // 3. Extração correta
    let textoAula = "";
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const res = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' });
      textoAula = res.data;
    } else {
      const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' });
      textoAula = res.data;
    }

    // 4. Chamada ao Gemini 2.5 Flash
    const prompt = `
      Você é um tutor acadêmico da PUCRS para a Caroline.
      Com base na aula abaixo, responda à dúvida dela.
      
      CONTEÚDO DA AULA:
      ${textoAula}
      
      PERGUNTA DA CAROLINE:
      ${pergunta}
    `;
    
    const result = await model.generateContent(prompt);
    console.log("\n--- 🎓 RESPOSTA DO TUTOR (Gemini 2.5 Flash) ---");
    console.log(result.response.text());

  } catch (error) {
    console.error("❌ Erro no processamento:", error.message);
  }
}

// Usando o ID da pasta Aula_02 que você já tem
const ID_PASTA_AULA = "1YXpwNc3IcNoZpZxtbh3lehdb_D0ydEz7"; 
estudarAula(ID_PASTA_AULA, "Faça um resumo dos 3 conceitos técnicos mais importantes dessa aula.");
