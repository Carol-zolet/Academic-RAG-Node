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

async function lerConteudoArquivo(fileId) {
  try {
    const res = await drive.files.get({ fileId, alt: 'media' });
    console.log("\n--- 📖 CONTEÚDO DO ARQUIVO ---");
    console.log(res.data);
  } catch (error) {
    console.error("❌ Erro ao ler arquivo:", error.message);
  }
}

// Para testar, você precisará passar o ID de um arquivo que o agente_ads encontrou
console.log("Agente Leitor pronto. Use 'lerConteudoArquivo(ID_DO_ARQUIVO)' para processar dados.");
