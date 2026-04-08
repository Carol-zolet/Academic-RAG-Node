import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();
const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());

// --- ROTA DO CHAT COM STREAMING E LOGICA SENIOR ---
app.post('/chat-turbo', async (req, res) => {
    const { pergunta, materiaSelecionada } = req.body;
    
    try {
        const indice = JSON.parse(fs.readFileSync('./indice_estudos.json', 'utf8'));
        let contexto = materiaSelecionada === "todas" 
            ? Object.values(indice).join('\n').substring(0, 12000) 
            : (indice[materiaSelecionada] || "Sem material específico.");

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await groq.chat.completions.create({
            messages: [
                { 
                    role: 'system', 
                    content: `És a IA Carol-ADS, mentora sênior de ADS na PUCRS. 
                    Teu objetivo é guiar a Caroline (estudante de 2024 a 2026).
                    
                    REGRAS DE RESPOSTA:
                    1. Usa Markdown rigorosamente (**negrito**, tabelas, blocos de código).
                    2. Explica o conceito acadêmico antes de dar a solução técnica.
                    3. Sugere boas práticas de Clean Code e Arquitetura.
                    4. Se a pergunta for sobre um projeto, estrutura a resposta em: Análise, Implementação e Teste.
                    
                    CONTEXTO DAS DISCIPLINAS: ${contexto}` 
                },
                { role: 'user', content: pergunta }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
        res.end();

    } catch (e) {
        res.write(`data: ${JSON.stringify({ content: "⚠️ Erro: " + e.message })}\n\n`);
        res.end();
    }
});

// --- INTERFACE CLAUDE-STYLE DARK MODE ---
app.get('/', (req, res) => {
    const indice = JSON.parse(fs.readFileSync('./indice_estudos.json', 'utf8'));
    const options = Object.keys(indice).map(m => `<option value="${m}">${m.replace(/_/g, ' ')}</option>`).join('');

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <title>IA Carol-ADS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <style>
            :root { --bg: #0d1117; --sidebar: #161b22; --text: #c9d1d9; --accent: #58a6ff; --border: #30363d; --code-bg: #010409; }
            body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; margin: 0; }
            
            .header { background: var(--sidebar); border-bottom: 1px solid var(--border); padding: 0.8rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
            .header h1 { font-size: 1.2rem; margin: 0; color: white; }
            
            .chat-box { flex: 1; overflow-y: auto; padding: 2rem; max-width: 900px; margin: 0 auto; width: 100%; scroll-behavior: smooth; }
            
            .msg { margin-bottom: 2.5rem; animation: fadeIn 0.3s ease; }
            .user-msg { color: var(--accent); font-weight: 700; border-left: 3px solid var(--accent); padding-left: 15px; margin-bottom: 1rem; }
            .bot-msg { color: #e6edf3; line-height: 1.7; }
            
            /* Markdown Styling */
            .bot-msg pre { background: var(--code-bg); padding: 1.2rem; border-radius: 8px; border: 1px solid var(--border); margin: 15px 0; overflow-x: auto; }
            .bot-msg code { font-family: 'Fira Code', monospace; color: #ffa657; font-size: 0.9rem; }
            .bot-msg p { margin-bottom: 1rem; }
            .bot-msg strong { color: white; }

            .input-area { background: var(--bg); padding: 1.5rem; border-top: 1px solid var(--border); }
            .input-wrapper { max-width: 900px; margin: 0 auto; position: relative; }
            
            textarea { 
                width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; 
                background: var(--code-bg); color: white; resize: none; outline: none; transition: 0.2s;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            textarea:focus { border-color: var(--accent); }
            
            select { border: 1px solid var(--border); background: var(--sidebar); color: var(--accent); font-size: 0.85rem; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
            
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>IA Carol-<span style="color: var(--accent);">ADS</span></h1>
            <select id="materia">
                <option value="todas">📚 Todo o Currículo</option>
                ${options}
            </select>
        </div>

        <div id="chat" class="chat-box"></div>

        <div class="input-area">
            <div class="input-wrapper">
                <textarea id="pergunta" placeholder="Pergunte sobre código, arquitetura ou teoria..." rows="2"></textarea>
                <div style="position: absolute; right: 15px; bottom: 10px; font-size: 0.7rem; color: #666;">Enter envia | Shift+Enter pula</div>
            </div>
        </div>

        <script>
            const textarea = document.getElementById('pergunta');
            const chat = document.getElementById('chat');

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                }
            });

            async function enviar() {
                const text = textarea.value.trim();
                const materia = document.getElementById('materia').value;
                if(!text) return;

                // Mensagem Usuário
                chat.innerHTML += '<div class="msg user-msg">Caroline > ' + text + '</div>';
                
                // Mensagem Bot
                const botDiv = document.createElement('div');
                botDiv.className = 'msg bot-msg';
                chat.appendChild(botDiv);
                
                textarea.value = '';
                chat.scrollTop = chat.scrollHeight;

                let fullResponse = "";

                try {
                    const response = await fetch('/chat-turbo', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ pergunta: text, materiaSelecionada: materia })
                    });

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\\n');
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.substring(6));
                                    fullResponse += data.content;
                                    // Renderiza Markdown em tempo real
                                    botDiv.innerHTML = marked.parse(fullResponse);
                                } catch (e) {}
                            }
                        }
                        chat.scrollTop = chat.scrollHeight;
                    }
                } catch (err) {
                    botDiv.innerHTML = "❌ Erro: " + err.message;
                }
            }
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000; 
app.listen(PORT, '0.0.0.0', () => console.log(`⚡ IA Carol-ADS Ativa na porta ${PORT}`));