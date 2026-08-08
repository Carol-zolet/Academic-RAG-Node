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
// Configuração da porta para o Render (process.env.PORT)
const PORT = process.env.PORT || 3000;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const DISCIPLINAS_FOLDER_ID = '178JLC2zNL5c6bd9on-5fmPYrm3qnEDmn';

app.use(express.json());

// Glossário de definições formais canônicas — fonte de verdade para conceitos
// com risco de o modelo "lembrar errado" (formas normais, tipos de JOIN etc.),
// em vez de depender só do material bruto extraído dos PDFs do Drive.
let glossarioFormal = {};
try {
    glossarioFormal = JSON.parse(fs.readFileSync('./glossario_formal.json', 'utf8'));
    console.log(`✅ Glossário formal carregado: ${Object.keys(glossarioFormal).length} conceitos.`);
} catch (err) {
    console.error("⚠️ Aviso: glossario_formal.json não encontrado ou inválido. Seguindo sem referência canônica.", err.message);
}

// Roteamento leve por palavra-chave: retorna só as definições cujas tags
// aparecem na pergunta do usuário (sem custo de tokens quando não há match).
function buscarReferenciaCanonica(pergunta) {
    const perguntaLower = pergunta.toLowerCase();
    const entradas = Object.values(glossarioFormal).filter(entry =>
        entry.tags.some(tag => perguntaLower.includes(tag.toLowerCase()))
    );
    if (entradas.length === 0) return "";
    return entradas.map(e => `- ${e.definicao}`).join('\n');
}

async function extrairTudoDoDrive() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID, 
        process.env.GOOGLE_CLIENT_SECRET, 
        process.env.GOOGLE_REDIRECT_URI
    );

    // Verificação de segurança para o tokens.json
    try {
        if (fs.existsSync('./tokens.json')) {
            const tokenData = fs.readFileSync('./tokens.json', 'utf8');
            oauth2Client.setCredentials(JSON.parse(tokenData));
            console.log("✅ Tokens do Google carregados com sucesso.");
        } else {
            console.error("⚠️ Aviso: tokens.json não encontrado. Verifique os Secret Files no Render.");
        }
    } catch (err) {
        console.error("❌ Erro ao processar tokens.json:", err.message);
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log("🔍 Buscando materiais acadêmicos no Drive...");

    try {
        const busca = await drive.files.list({
            q: `'${DISCIPLINAS_FOLDER_ID}' in parents or (name contains 'Aula' or name contains 'Plano')`,
            fields: 'files(id, name, mimeType)'
        });

        let contextoExtraido = "";

        // Processa os primeiros 5 PDFs para manter o contexto dentro do limite da Groq
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
    } catch (error) {
        console.error("❌ Erro ao listar arquivos do Drive:", error.message);
        return "Erro ao acessar materiais do Drive.";
    }
}

app.post('/chat', async (req, res) => {
    const { pergunta } = req.body;
    
    try {
        const contexto = await extrairTudoDoDrive();
        const referenciaCanonica = buscarReferenciaCanonica(pergunta);

        // Chamada para o novo modelo Llama 3.3
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: `Você é o Tutor de ADS da Caroline na PUCRS.

REGRAS DE RESPOSTA:
1. Estrutura a explicação em UMA passada: defina o conceito, mostre o exemplo prático e feche na conclusão técnica — nessa ordem, sem reabrir ou revisar o raciocínio depois de já ter afirmado algo.
2. Nunca narre o processo de pensar. Não uses frases como "na verdade", "pensando melhor", "voltando atrás", "só para reconsiderar" ou equivalentes. Decida a resposta tecnicamente correta antes de escrever e apresente apenas essa versão final.
3. Se o material de contexto trouxer explicações repetidas, parciais ou aparentemente conflitantes sobre o mesmo tópico, resolva a divergência internamente e responda apenas com a versão tecnicamente mais precisa — não comente sobre inconsistências no material fornecido.
${referenciaCanonica ? `4. Abaixo há uma REFERÊNCIA TÉCNICA CANÔNICA para o(s) conceito(s) perguntado(s). Ela é a fonte de verdade para a definição formal — use-a como base mesmo que o CONTEXTO DAS DISCIPLINAS traga uma formulação diferente ou incompleta; pode usar exemplos do contexto para ilustrá-la.

REFERÊNCIA TÉCNICA CANÔNICA:
${referenciaCanonica}
` : ''}
TOM: direto e confiante, como um mentor sênior que já sabe a resposta — sem perder profundidade técnica nem os exemplos práticos.

Baseie-se nestes materiais: ${contexto}` },
                { role: 'user', content: pergunta }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
        });

        res.json({ resposta: completion.choices[0].message.content });
    } catch (e) {
        console.error("❌ Erro na rota /chat:", e.message);
        res.status(500).json({ error: "Ocorreu um erro no processamento da sua dúvida." });
    }
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Central ADS PUCRS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #0f172a; color: #f1f5f9; font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; }
            .chat-container { max-width: 800px; width: 95%; margin: 30px auto; background: #1e293b; border-radius: 15px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); flex-grow: 1; display: flex; flex-direction: column; }
            #chat-window { flex-grow: 1; overflow-y: auto; padding: 15px; background: #0f172a; border-radius: 10px; margin-bottom: 20px; border: 1px solid #334155; }
            .msg { margin-bottom: 15px; padding: 12px; border-radius: 10px; line-height: 1.5; }
            .bot { background: #334155; border-left: 5px solid #3b82f6; color: #e2e8f0; }
            .user { background: #3b82f6; text-align: right; margin-left: 15%; color: white; }
            .loading { font-style: italic; color: #94a3b8; }
        </style>
    </head>
    <body>
        <div class="container d-flex flex-column h-100">
            <div class="chat-container">
                <h2 class="text-center text-info mb-4">Central de Inteligência ADS 🎓</h2>
                <div id="chat-window">
                    <div class="msg bot">Olá Caroline! Já varri suas pastas da PUCRS. O que vamos estudar hoje?</div>
                </div>
                <div class="input-group">
                    <input type="text" id="pergunta" class="form-control bg-dark text-white border-secondary" placeholder="Tira sua dúvida sobre as aulas...">
                    <button class="btn btn-primary" id="btn-perguntar" onclick="perguntar()">Perguntar</button>
                </div>
            </div>
        </div>
        <script>
            async function perguntar() {
                const input = document.getElementById('pergunta');
                const win = document.getElementById('chat-window');
                const btn = document.getElementById('btn-perguntar');
                const p = input.value;
                if(!p) return;

                // Interface do usuário
                win.innerHTML += '<div class="msg user">' + p + '</div>';
                const loadingId = "loading-" + Date.now();
                win.innerHTML += '<div class="msg bot loading" id="' + loadingId + '">Pensando...</div>';
                input.value = '';
                btn.disabled = true;
                win.scrollTop = win.scrollHeight;

                try {
                    const res = await fetch('/chat', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ pergunta: p })
                    });
                    const data = await res.json();
                    document.getElementById(loadingId).remove();
                    win.innerHTML += '<div class="msg bot">' + (data.resposta || "Ops, tive um problema ao buscar essa informação.") + '</div>';
                } catch (err) {
                    document.getElementById(loadingId).innerText = "Erro ao conectar com o servidor. Tente novamente.";
                } finally {
                    btn.disabled = false;
                    win.scrollTop = win.scrollHeight;
                }
            }
            // Permite dar Enter para enviar
            document.getElementById('pergunta').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') perguntar();
            });
        </script>
    </body>
    </html>
    `);
});

// Inicialização com host 0.0.0.0 para o Render aceitar conexões externas
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ativo na porta ${PORT}`);
});
