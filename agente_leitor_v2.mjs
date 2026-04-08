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

async function explorarPastaEspecifica(folderId) {
  try {
    console.log(`\n--- 📂 AGENTE LEITOR: Explorando Conteúdo Interno ---`);
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    if (res.data.files.length === 0) {
      console.log("Esta pasta esta vazia.");
    } else {
      res.data.files.forEach(file => {
        const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
        console.log(`${icon} ${file.name} [ID: ${file.id}]`);
      });
    }
  } catch (error) {
    console.error("Erro ao explorar pasta:", error.message);
  }
}

// Usando o ID da sua pasta de Backend que o agente_ads encontrou
const ID_PASTA_BACKEND = "1LIDeFdmTqjP6xFPWyn332zllStSNXsBr";
explorarPastaEspecifica(ID_PASTA_BACKEND);
