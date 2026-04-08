import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from 'readline';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
);
const tokens = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
oauth2Client.setCredentials(tokens);
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Interface para ler o teclado
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function chatComAula(aulaFolderId) {
    try {
        console.log("--- 🔎 Carregando Conteúdo da Aula... ---");
        
        // Busca a transcrição (mesma lógica que funcionou antes)
        const subpasta = await drive.files.list({
            q: `'${aulaFolderId}' in parents and name = 'Transcricoes'`,
            fields: 'files(id)'
        });
        const arquivos = await drive.files.list({
            q: `'${subpasta.data.files[0].id}' in parents and (mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.document')`,
            fields: 'files(id, name, mimeType)'
        });

        let textoAula = "";
        const file = arquivos.data.files[0];
        if (file.mimeType === 'application/vnd.google-apps.document') {
            const res = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' });
            textoAula = res.data;
        } else {
            const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' });
            textoAula = res.data;
        }

        console.log(`✅ Aula "${file.name}" carregada!`);
        console.log("Digite sua dúvida (ou 'sair' para encerrar):");

        const perguntar = () => {
            rl.question('\n👤 Você: ', async (duvida) => {
                if (duvida.toLowerCase() === 'sair') return rl.close();

                console.log("🤖 Pensando...");
                const prompt = `Use este conteúdo de aula para responder: ${textoAula}\n\nPergunta: ${duvida}`;
                const result = await model.generateContent(prompt);
                
                console.log("\n🎓 Tutor ADS:");
                console.log(result.response.text());
                
                perguntar(); // Loop para a próxima pergunta
            });
        };

        perguntar();

    } catch (error) {
        console.error("❌ Erro:", error.message);
    }
}

const ID_PASTA_AULA = "1YXpwNc3IcNoZpZxtbh3lehdb_D0ydEz7"; 
chatComAula(ID_PASTA_AULA);
