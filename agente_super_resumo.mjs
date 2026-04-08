import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CACHE_FILE = './resumos_cache.json';

async function gerarComGroq(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      // MUDANÇA AQUI: Usando a versão estável e recomendada
      model: 'llama-3.3-70b-versatile', 
      temperature: 0.5,
    });
    return completion.choices[0].message.content;
  } catch (e) {
    console.error(`⚠️ Erro na Groq: ${e.message}`);
    return null;
  }
}

let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE)) : {};

async function gerarSuperResumo(disciplinaId) {
  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    oauth2Client.setCredentials(JSON.parse(fs.readFileSync('./tokens.json')));
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log("--- 🚀 AGENTE GROQ: Retomando com Modelo Estável ---");

    const aulas = await drive.files.list({
      q: `'${disciplinaId}' in parents and name contains 'Aula'`,
      fields: 'files(id, name)', orderBy: 'name'
    });

    for (const aula of aulas.data.files) {
      if (cache[aula.id]) {
        console.log(`⏭️ ${aula.name} já resumida.`);
        continue;
      }

      console.log(`📝 Processando: ${aula.name}...`);
      const sub = await drive.files.list({ q: `'${aula.id}' in parents and name = 'Transcricoes'`, fields: 'files(id)' });
      
      if (sub.data.files.length > 0) {
        const arquivos = await drive.files.list({
          q: `'${sub.data.files[0].id}' in parents and (mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.document')`,
          fields: 'files(id, name, mimeType)'
        });

        if (arquivos.data.files.length > 0) {
          const file = arquivos.data.files[0];
          let texto = (file.mimeType === 'application/vnd.google-apps.document') 
            ? (await drive.files.export({ fileId: file.id, mimeType: 'text/plain' })).data
            : (await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' })).data;

          const resumo = await gerarComGroq(`Resuma os 3 pontos técnicos chave desta aula de ADS: ${texto.substring(0, 10000)}`);
          
          if (resumo) {
            cache[aula.id] = { nome: aula.name, resumo };
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
            console.log(`✅ ${aula.name} processada.`);
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    console.log("--- 🧠 Gerando Guia de Sobrevivência Final ---");
    const contextoFinal = Object.values(cache).map(c => `${c.nome}: ${c.resumo}`).join('\n');
    const guiaFinal = await gerarComGroq(`Você é tutor de ADS na PUCRS. Crie um guia de estudos baseado nesses resumos:\n${contextoFinal}`);
    
    if (guiaFinal) {
      console.log("\n--- 🎓 SUPER RESUMO FINAL (Via Groq) ---\n", guiaFinal);
    }

  } catch (error) {
    console.error("❌ Erro:", error.message);
  }
}

gerarSuperResumo("1Hv8J9EcEaTY7Ai8rhoB9GifTIZr4Sbx0");
