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

async function executarRastreio() {
  try {
    console.log("\n--- 🕵️ AGENTE ADS: Iniciando Pesquisa Flexível ---");

    // Mudamos de 'name =' para 'name contains' e buscamos apenas por 'ADS'
    const buscaPasta = await drive.files.list({
      q: "name contains 'ADS' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
    });

    if (buscaPasta.data.files.length === 0) {
      console.log("❌ Nenhuma pasta com 'ADS' no nome foi encontrada.");
      return;
    }

    // Se houver mais de uma pasta com ADS, vamos listar o conteúdo da primeira encontrada
    const pasta = buscaPasta.data.files[0];
    const folderId = pasta.id;
    console.log(`✅ Pasta Localizada: "${pasta.name}" (ID: ${folderId})`);

    const listaArquivos = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    console.log("\n--- 📚 CONTEÚDO ENCONTRADO ---");
    if (listaArquivos.data.files.length === 0) {
      console.log("A pasta está vazia.");
    } else {
      listaArquivos.data.files.forEach(file => {
        const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
        console.log(`${icon} ${file.name} [ID: ${file.id}]`);
      });
    }

  } catch (error) {
    console.error("❌ Erro na Pipeline:", error.message);
  }
}

executarRastreio();