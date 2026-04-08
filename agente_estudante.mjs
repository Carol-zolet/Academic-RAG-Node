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

async function lerTranscricaoAula(pastaAulaId) {
  try {
    console.log(`--- 🔎 Localizando Transcrições ---`);
    
    // 1. Entra na pasta da Aula e busca pela subpasta "Transcricoes"
    const buscaSubpasta = await drive.files.list({
      q: `'${pastaAulaId}' in parents and name = 'Transcricoes' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name)'
    });

    if (buscaSubpasta.data.files.length === 0) {
      console.log("❌ Subpasta 'Transcricoes' não encontrada.");
      return;
    }

    const transcricoesId = buscaSubpasta.data.files[0].id;

    // 2. Lista os arquivos .txt dentro de Transcricoes
    const arquivos = await drive.files.list({
      q: `'${transcricoesId}' in parents and mimeType = 'text/plain'`,
      fields: 'files(id, name)'
    });

    if (arquivos.data.files.length === 0) {
      console.log("❌ Nenhum arquivo de texto encontrado em Transcricoes.");
      return;
    }

    // 3. Lê o conteúdo do primeiro arquivo encontrado (ex: AULA 1.txt)
    const fileId = arquivos.data.files[0].id;
    const fileName = arquivos.data.files[0].name;
    
    const conteudo = await drive.files.get({ fileId: fileId, alt: 'media' });

    console.log(`✅ Sucesso! Lendo: ${fileName}`);
    console.log("\n--- CONTEÚDO DA AULA ---");
    console.log(conteudo.data);
    
  } catch (error) {
    console.error("❌ Erro no fluxo de leitura:", error.message);
  }
}

// TESTE: Usando o ID da "Aula_01" de Sistemas Mobile que vimos na sua imagem
const ID_AULA_01_MOBILE = "1YXpwNc3IcNoZpZxtbh3lehdb_D0ydEz7"; 
lerTranscricaoAula(ID_AULA_01_MOBILE);
