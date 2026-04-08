import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// 1. Configuração das APIs
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const tokens = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
oauth2Client.setCredentials(tokens);
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function perguntarParaAula(fileId, perguntaUsuario) {
  try {
    console.log("--- 🧠 Agente IA: Lendo conteúdo e processando... ---");

    // Passo A: Baixa o texto da transcrição no Drive
    const res = await drive.files.get({ fileId: fileId, alt: 'media' });
    const textoAula = res.data;

    // Passo B: Cria o prompt para o Gemini
    const prompt = `
      Você é um tutor especializado para a estudante de Sistemas Caroline. 
      Com base na transcrição da aula abaixo, responda à pergunta dela de forma clara e técnica.
      
      CONTEÚDO DA AULA:
      ${textoAula}
      
      PERGUNTA DA CAROLINE:
      ${perguntaUsuario}
    `;

    // Passo C: Gera a resposta
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    console.log("\n--- 🎓 RESPOSTA DO SEU TUTOR ADS ---");
    console.log(response.text());

  } catch (error) {
    console.error("❌ Erro na integração com IA:", error.message);
  }
}

// TESTE: Vamos perguntar algo sobre a Aula 01 de Sistemas Mobile
// Use o ID de um arquivo .txt que o seu agente_indexador encontrou
const ID_ARQUIVO_TXT = "COLE_AQUI_ID_DO_ARQUIVO_TXT"; 
const minhaDuvida = "Quais são os conceitos principais explicados nesta aula?";

perguntarParaAula(ID_ARQUIVO_TXT, minhaDuvida);
