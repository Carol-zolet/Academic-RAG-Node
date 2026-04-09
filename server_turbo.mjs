import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { marked } from 'marked';
import Groq from 'groq-sdk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfExtract = require('pdf-parse');

dotenv.config();

const app = express();
// AJUSTE 1: Porta dinâmica para o Render
const PORT = process.env.PORT || 3000;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const DISCIPLINAS_FOLDER_ID = '178JLC2zNL5c6bd9on-5fmPYrm3qnEDmn';

app.use(express.json());

async function extrairTudoDoDrive() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID, 
        process.env.GOOGLE_CLIENT_SECRET, 
        process.env.GOOGLE_REDIRECT_URI
    );

    // AJUSTE 2: Leitura segura do tokens.json para não crashar o servidor
    try {
        if (fs.existsSync('./tokens.json')) {
            const tokenData = fs.readFileSync('./tokens.json', 'utf8');
            oauth2Client.setCredentials(JSON.parse(tokenData));
            console.log("✅ Tokens do Google carregados.");
        } else {
            console.error("⚠️ Atenção: tokens.json não encontrado. Verifique os Secret Files.");
        }
    } catch (err) {
        console.error("❌ Erro ao processar tokens.json:", err.message);
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log("🔍 Varrendo pastas de disciplinas...");

    const busca = await drive.files.list({
        q: `'${DISCIPLINAS_FOLDER_ID}' in parents or (name contains 'Aula' or name contains 'Plano')`,
        fields: 'files(id, name, mimeType)'
    });

    let contextoExtraido = "";

    // AJUSTE 3: Reduzi para os primeiros 5 arquivos para evitar erro 413 (Token limit)
    for (const arquivo of busca.data.files.slice(0, 5)) {
        if (arquivo.mimeType === 'application/pdf') {
            try {
                const res = await drive.files.get({ fileId: arquivo.id, alt: 'media' }, { responseType: 'arraybuffer' });
                const data = await pdfExtract(Buffer.from(res.data));
                contextoExtraido += `\n--- MATÉRIA: ${arquivo.name} ---\n${data.text.substring(0, 3000)}\n`;
            } catch (e) {
                console.log(`Pulei o arquivo ${arquivo.name} por erro de leitura.`);
            }
        }
    }
    return contextoExtraido;
}

app.post('/chat', async (req, res) => {
    const { pergunta } = req.body;
    
    try {
        const contexto = await extrairTudoDoDrive();
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: `Você é o Tutor de ADS da Caroline na PUCRS. Baseie-se nestes materiais: ${contexto}` },
                { role: 'user', content: pergunta }
            ],
            // Usando o modelo Mixtral que aguenta mais contexto (tokens)
            model: 'mixtral-8x7b-32768',
        });
        res.json({ resposta: completion.choices[0].message.content });
    } catch (e) {
        console.error("❌ Erro na rota /chat:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Central ADS PUCRS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #0f172a; color: #f1f5f9; font-family: 'Inter', sans-serif; }
            .chat-container { max-width: 800px; margin: 50px auto; background: #1e293b; border-radius: 15px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            #chat-window { height: 400px; overflow-y: auto; padding: 15px; background: #0f172a; border-radius: 10px; margin-bottom: 20px; border: 1px solid #334155; }
            .msg { margin-bottom: 15px; padding: 10px; border-radius: 10px; }
            .bot { background: #334155; border-left: 5px solid #3b82f6; }
            .user { background: #3b82f6; text-align: right; margin-left: 20%; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="chat-container">
                <h2 class="text-center text-info mb-4">Central de Inteligência ADS 🎓</h2>
                <div id="chat-window">
                    <div class="msg bot">Olá Caroline! Tenho acesso às suas pastas de 2024 a 2026. O que quer revisar hoje?</div>
                </div>
                <div class="input-group">
                    <input type="text" id="pergunta" class="form-control bg-dark text-white border-secondary" placeholder="Dúvida sobre Backend, DevOps, Mobile...">
                    <button class="btn btn-primary" onclick="perguntar()">Perguntar</button>
                </div>
            </div>
        </div>
        <script>
            async function perguntar() {
                const input = document.getElementById('pergunta');
                const win = document.getElementById('chat-window');
                const p = input.value;
                if(!p) return;

                win.innerHTML += '<div class="msg user">' + p + '</div>';
                input.value = '';
                win.scrollTop = win.scrollHeight;

                try {
                    const res = await fetch('/chat', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ pergunta: p })
                    });
                    const data = await res.json();
                    win.innerHTML += '<div class="msg bot">' + (data.resposta || data.error) + '</div>';
                } catch (err) {
                    win.innerHTML += '<div class="msg bot text-danger">Erro ao conectar com o servidor.</div>';
                }
                win.scrollTop = win.scrollHeight;
            }
        </script>
    </body>
    </html>
    `);
});

// AJUSTE 4: Escutando no host 0.0.0.0 (Essencial para o Render)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor voando na porta ${PORT}`);
});
