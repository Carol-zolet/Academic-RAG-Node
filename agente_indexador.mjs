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

async function indexarTudo(disciplinaId) {
  try {
    console.log("--- 🚀 AGENTE INDEXADOR: Mapeando Semestre ---");

    // 1. Lista todas as pastas de "Aula" dentro da disciplina
    const aulas = await drive.files.list({
      q: `'${disciplinaId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains 'Aula'`,
      fields: 'files(id, name)',
      orderBy: 'name'
    });

    for (const aula of aulas.data.files) {
      console.log(`\n📂 Entrando na ${aula.name}...`);

      // 2. Busca a subpasta "Transcricoes" dentro da aula atual
      const subpasta = await drive.files.list({
        q: `'${aula.id}' in parents and name = 'Transcricoes'`,
        fields: 'files(id, name)'
      });

      if (subpasta.data.files.length > 0) {
        const transId = subpasta.data.files[0].id;

        // 3. Busca o arquivo .txt
        const arquivo = await drive.files.list({
          q: `'${transId}' in parents and mimeType = 'text/plain'`,
          fields: 'files(id, name)'
        });

        if (arquivo.data.files.length > 0) {
          const file = arquivo.data.files[0];
          const conteudo = await drive.files.get({ fileId: file.id, alt: 'media' });
          
          console.log(`📄 Lendo conteúdo de: ${file.name}`);
          // Aqui você poderia salvar em um banco de dados ou vetor
          console.log("   (Texto capturado com sucesso!)");
        }
      }
    }
    console.log("\n--- ✅ Indexação Concluída ---");
  } catch (error) {
    console.error("❌ Erro na indexação:", error.message);
  }
}

// ID da pasta "Sistemas_Mobile" que pegamos no seu print anterior
const ID_SISTEMAS_MOBILE = "1Hv8J9EcEaTY7Ai8rhoB9GifTIZr4Sbx0";
indexarTudo(ID_SISTEMAS_MOBILE);
