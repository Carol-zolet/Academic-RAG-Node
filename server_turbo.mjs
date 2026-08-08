import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { marked } from 'marked';
import Groq from 'groq-sdk';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';

const require = createRequire(import.meta.url);
const pdfExtract = require('pdf-parse');

dotenv.config();

const app = express();
// Configuração da porta para o Render (process.env.PORT)
const PORT = process.env.PORT || 3000;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const DISCIPLINAS_FOLDER_ID = '178JLC2zNL5c6bd9on-5fmPYrm3qnEDmn';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !process.env.APP_USERNAME || !process.env.APP_PASSWORD_HASH) {
    console.error("⚠️ Aviso: APP_USERNAME, APP_PASSWORD_HASH ou JWT_SECRET não configurados. O login não vai funcionar até essas variáveis serem definidas no .env / Render.");
}

app.use(express.json());
app.use(cookieParser());

// --- AUTENTICAÇÃO (login único, sem cadastro — só a Caroline usa este app) ---

function verificarToken(req) {
    const token = req.cookies && req.cookies.token;
    if (!token || !JWT_SECRET) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// Protege rotas de página: sem sessão válida, redireciona pro login.
function exigirAuthPagina(req, res, next) {
    if (verificarToken(req)) return next();
    return res.redirect('/login');
}

// Protege rotas de API: sem sessão válida, responde 401 (sem redirecionar,
// já que quem chama é fetch()).
function exigirAuthAPI(req, res, next) {
    if (verificarToken(req)) return next();
    return res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
}

app.post('/login', async (req, res) => {
    const { usuario, senha } = req.body || {};
    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const usuarioOk = usuario === process.env.APP_USERNAME;
    // Roda o bcrypt.compare mesmo quando o usuário já está errado (contra um hash
    // inválido fixo), pra não vazar por timing se foi o usuário ou a senha que errou.
    const hashParaComparar = process.env.APP_PASSWORD_HASH || '$2b$12$invalidinvalidinvaliduinvalidinvalidinvalidinvalidin';
    const senhaOk = await bcrypt.compare(senha, hashParaComparar);

    if (!usuarioOk || !senhaOk) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ sub: usuario }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
});

app.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
});

app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login — Central ADS PUCRS</title>
        <style>
            :root {
                --bg: #0f172a; --surface-alt: #1e293b; --border: #2d3748;
                --text: #e2e8f0; --text-muted: #94a3b8; --accent: #3b82f6; --danger: #f87171;
            }
            * { box-sizing: border-box; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center; }
            form { background: var(--surface-alt); border: 1px solid var(--border); border-radius: 14px; padding: 2rem; width: 90%; max-width: 340px; display: flex; flex-direction: column; gap: 0.9rem; }
            h1 { font-size: 1.05rem; margin: 0 0 0.4rem; text-align: center; }
            input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 0.6rem 0.75rem; border-radius: 8px; font-size: 0.95rem; }
            input:focus { outline: none; border-color: var(--accent); }
            button { background: var(--accent); color: white; border: none; padding: 0.65rem; border-radius: 8px; font-size: 0.95rem; cursor: pointer; }
            button:hover { opacity: 0.9; }
            .erro { color: var(--danger); font-size: 0.82rem; text-align: center; min-height: 1em; }
        </style>
    </head>
    <body>
        <form id="form-login">
            <h1>🎓 Central de Inteligência ADS</h1>
            <input type="text" id="usuario" placeholder="Usuário" autocomplete="username" required>
            <input type="password" id="senha" placeholder="Senha" autocomplete="current-password" required>
            <div class="erro" id="erro"></div>
            <button type="submit">Entrar</button>
        </form>
        <script>
            document.getElementById('form-login').addEventListener('submit', async function (e) {
                e.preventDefault();
                const usuario = document.getElementById('usuario').value.trim();
                const senha = document.getElementById('senha').value;
                const erroEl = document.getElementById('erro');
                erroEl.textContent = '';
                try {
                    const res = await fetch('/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ usuario, senha })
                    });
                    if (res.ok) {
                        window.location.href = '/';
                    } else {
                        const data = await res.json().catch(() => ({}));
                        erroEl.textContent = data.error || 'Não foi possível entrar.';
                    }
                } catch (err) {
                    erroEl.textContent = 'Erro ao conectar com o servidor.';
                }
            });
        </script>
    </body>
    </html>
    `);
});

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

// Varre recursivamente uma pasta do Drive e devolve só os arquivos (não pastas)
// encontrados em qualquer nível abaixo dela — restringe a busca à árvore de
// DISCIPLINAS_FOLDER_ID, em vez de depender de um filtro de nome no Drive inteiro.
async function listarArquivosRecursivo(drive, folderId) {
    const arquivos = [];
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 200
    });

    for (const item of res.data.files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            const doSubdiretorio = await listarArquivosRecursivo(drive, item.id);
            arquivos.push(...doSubdiretorio);
        } else {
            arquivos.push(item);
        }
    }
    return arquivos;
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
        // Restrito só à árvore da pasta "Disciplinas" (DISCIPLINAS_FOLDER_ID) — sem
        // o fallback antigo por nome ('Aula'/'Plano'), que buscava no Drive inteiro
        // e podia expor arquivos fora do escopo pretendido.
        const arquivosDaArvore = await listarArquivosRecursivo(drive, DISCIPLINAS_FOLDER_ID);

        let contextoExtraido = "";

        // Processa os primeiros 5 PDFs para manter o contexto dentro do limite da Groq
        const pdfs = arquivosDaArvore.filter(a => a.mimeType === 'application/pdf');
        for (const arquivo of pdfs.slice(0, 5)) {
            try {
                const res = await drive.files.get({ fileId: arquivo.id, alt: 'media' }, { responseType: 'arraybuffer' });
                const data = await pdfExtract(Buffer.from(res.data));
                contextoExtraido += `\n--- MATÉRIA: ${arquivo.name} ---\n${data.text.substring(0, 3000)}\n`;
            } catch (e) {
                console.log(`Pulei o arquivo ${arquivo.name} por erro de leitura.`);
            }
        }
        return contextoExtraido;
    } catch (error) {
        console.error("❌ Erro ao listar arquivos do Drive:", error.message);
        return "Erro ao acessar materiais do Drive.";
    }
}

app.post('/chat', exigirAuthAPI, async (req, res) => {
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

app.get('/', exigirAuthPagina, (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Central ADS PUCRS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM" crossorigin="anonymous">
        <script src="https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.min.js" integrity="sha384-9PmP/diBVg7hDN6uMUn4SpBC7n322ZYVykpvvk18h35Gds6qZYqjMWeVBH/gATDu" crossorigin="anonymous"></script>
        <style>
            :root {
                --bg: #0f172a;
                --surface: #161b22;
                --surface-alt: #1e293b;
                --border: #2d3748;
                --text: #e2e8f0;
                --text-muted: #94a3b8;
                --accent: #3b82f6;
                --accent-soft: rgba(59, 130, 246, 0.15);
                --user-bubble: #263042;
                --success: #4ade80;
            }
            * { box-sizing: border-box; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; margin: 0; }
            .app { display: flex; flex-direction: column; height: 100%; }
            .app-header { display: flex; align-items: center; justify-content: center; position: relative; padding: 1.1rem 1rem 0.9rem; font-size: 1.15rem; font-weight: 600; border-bottom: 1px solid var(--border); }
            .logout-btn { position: absolute; right: 1rem; background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; padding: 0.3rem 0.7rem; border-radius: 6px; cursor: pointer; }
            .logout-btn:hover { color: var(--text); border-color: var(--accent); }

            #chat-window { flex: 1; overflow-y: auto; padding: 1.5rem 1rem; max-width: 900px; width: 100%; margin: 0 auto; }

            .msg-row { display: flex; gap: 0.75rem; margin-bottom: 1.75rem; align-items: flex-start; }
            .msg-row.user { flex-direction: row-reverse; }

            .avatar { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; }
            .avatar.bot { background: var(--accent-soft); color: var(--accent); }
            .avatar.user { background: var(--surface-alt); color: var(--text-muted); }

            .msg-content-wrap { max-width: 78%; display: flex; flex-direction: column; }
            .msg-row.user .msg-content-wrap { align-items: flex-end; }

            .msg-bubble { line-height: 1.65; }
            .msg-row.user .msg-bubble { background: var(--user-bubble); padding: 0.65rem 1rem; border-radius: 14px; border-top-right-radius: 4px; }
            .msg-row.bot .msg-bubble { padding: 0.1rem 0; }

            .msg-bubble p { margin: 0 0 0.7rem; }
            .msg-bubble p:last-child { margin-bottom: 0; }
            .msg-bubble pre { background: var(--surface); border: 1px solid var(--border); padding: 0.9rem; border-radius: 8px; overflow-x: auto; }
            .msg-bubble code { font-family: 'Fira Code', ui-monospace, monospace; font-size: 0.88rem; }
            .msg-bubble pre code { font-size: 0.85rem; }
            .msg-bubble table { border-collapse: collapse; width: 100%; margin: 0.7rem 0; display: block; overflow-x: auto; }
            .msg-bubble th, .msg-bubble td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
            .msg-bubble th { background: var(--surface); }

            .msg-actions { display: flex; gap: 0.4rem; margin-top: 0.5rem; opacity: 0; transition: opacity 0.15s ease; }
            .msg-row.bot:hover .msg-actions, .msg-row.bot:focus-within .msg-actions, .msg-actions.copiado { opacity: 1; }
            @media (hover: none) { .msg-actions { opacity: 1; } }

            .copy-btn { display: inline-flex; align-items: center; gap: 0.3rem; background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; padding: 0.25rem 0.55rem; border-radius: 6px; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
            .copy-btn:hover { color: var(--text); border-color: var(--accent); }
            .copy-btn.copiado { color: var(--success); border-color: var(--success); }
            .copy-btn svg { width: 13px; height: 13px; }

            .thinking-dots { display: flex; gap: 4px; padding: 0.5rem 0; }
            .thinking-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: bounce 1.3s infinite ease-in-out; }
            .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
            .thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
            @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }

            .input-area { border-top: 1px solid var(--border); padding: 1rem; }
            .input-wrapper { max-width: 900px; margin: 0 auto; }
        </style>
    </head>
    <body>
        <div class="app">
            <div class="app-header">
                Central de Inteligência ADS 🎓
                <button class="logout-btn" onclick="sair()">Sair</button>
            </div>
            <div id="chat-window">
                <div class="msg-row bot">
                    <div class="avatar bot">IA</div>
                    <div class="msg-content-wrap">
                        <div class="msg-bubble">Olá Caroline! Já varri suas pastas da PUCRS. O que vamos estudar hoje?</div>
                    </div>
                </div>
            </div>
            <div class="input-area">
                <div class="input-wrapper">
                    <div class="input-group">
                        <input type="text" id="pergunta" class="form-control bg-dark text-white border-secondary" placeholder="Tira sua dúvida sobre as aulas...">
                        <button class="btn btn-primary" id="btn-perguntar" onclick="perguntar()">Perguntar</button>
                    </div>
                </div>
            </div>
        </div>
        <script>
            // Guarda o texto em markdown puro de cada resposta do bot, pra copiar sem
            // depender do HTML já renderizado na tela.
            const respostasRaw = {};

            function escapeHtml(str) {
                return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            // Escapa qualquer HTML bruto ANTES de mandar pro marked, pra que uma resposta
            // do modelo não possa injetar <script>/<img onerror> etc. na página via markdown.
            function renderMarkdown(texto) {
                try {
                    return marked.parse(escapeHtml(texto));
                } catch (e) {
                    return escapeHtml(texto);
                }
            }

            function copiarResposta(id, btn) {
                const texto = respostasRaw[id] || '';
                navigator.clipboard.writeText(texto).then(() => {
                    const original = btn.innerHTML;
                    btn.classList.add('copiado');
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copiado!';
                    setTimeout(() => {
                        btn.classList.remove('copiado');
                        btn.innerHTML = original;
                    }, 1600);
                }).catch(() => {
                    btn.innerText = 'Erro ao copiar';
                });
            }

            async function perguntar() {
                const input = document.getElementById('pergunta');
                const win = document.getElementById('chat-window');
                const btn = document.getElementById('btn-perguntar');
                const p = input.value.trim();
                if (!p) return;

                // Linha do usuário (innerText, não innerHTML — evita injeção via texto digitado)
                const userRow = document.createElement('div');
                userRow.className = 'msg-row user';
                userRow.innerHTML = '<div class="avatar user">Eu</div><div class="msg-content-wrap"><div class="msg-bubble"></div></div>';
                userRow.querySelector('.msg-bubble').innerText = p;
                win.appendChild(userRow);

                // Linha do bot com indicador de "pensando"
                const msgId = 'msg-' + Date.now();
                const botRow = document.createElement('div');
                botRow.className = 'msg-row bot';
                botRow.id = msgId;
                botRow.innerHTML = '<div class="avatar bot">IA</div><div class="msg-content-wrap"><div class="msg-bubble"><div class="thinking-dots"><span></span><span></span><span></span></div></div></div>';
                win.appendChild(botRow);

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
                    const texto = data.resposta || 'Ops, tive um problema ao buscar essa informação.';
                    respostasRaw[msgId] = texto;

                    botRow.querySelector('.msg-bubble').innerHTML = renderMarkdown(texto);

                    const actions = document.createElement('div');
                    actions.className = 'msg-actions';
                    actions.innerHTML = '<button class="copy-btn" onclick="copiarResposta(\\'' + msgId + '\\', this)">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copiar</button>';
                    botRow.querySelector('.msg-content-wrap').appendChild(actions);
                } catch (err) {
                    botRow.querySelector('.msg-bubble').innerText = 'Erro ao conectar com o servidor. Tente novamente.';
                } finally {
                    btn.disabled = false;
                    win.scrollTop = win.scrollHeight;
                }
            }
            // Permite dar Enter para enviar
            document.getElementById('pergunta').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') perguntar();
            });

            async function sair() {
                await fetch('/logout', { method: 'POST' }).catch(() => {});
                window.location.href = '/login';
            }
        </script>
    </body>
    </html>
    `);
});

// Inicialização com host 0.0.0.0 para o Render aceitar conexões externas
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ativo na porta ${PORT}`);
});
