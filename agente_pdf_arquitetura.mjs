import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CACHE_FILE = './resumos_cache.json';

async function extrairTextoPDF(buffer) {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    let textoCompleto = "";

    // Lemos as primeiras 20 páginas para ter contexto sem estourar a memória
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textoCompleto += content.items.map(item => item.str).join(" ") + "\n";
    }
    return textoCompleto;
}

async function analisarComComparacao(textoLivro, resumosAulas) {
  const prompt = `
    Você é um arquiteto de software sênior. 
    Compare o trecho do livro "Arquitetura Limpa" com os resumos das aulas de ADS da Caroline.
    Explique a conexão entre a teoria das camadas e o uso de React Native/Flutter visto nas aulas.
    
    AULAS: ${resumosAulas}
    LIVRO: ${textoLivro.substring(0, 10000)}
  `;

  try {
    const chat = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
    });
    return chat.choices[0].message.content;
  } catch (e) {
    return "Erro na análise: " + e.message;
  }
}

async function processarPDF() {
  try {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(JSON.parse(fs.readFileSync('./tokens.json', 'utf8')));
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log("--- 📚 AGENTE PDF 2.0: Usando PDF.js ---");

    const busca = await drive.files.list({
      q: "name contains 'Arquitetura Limpa' and mimeType = 'application/pdf'",
      fields: 'files(id, name)'
    });

    if (busca.data.files.length === 0) {
      console.log("❌ PDF não encontrado no Drive.");
      return;
    }

    const fileId = busca.data.files[0].id;
    console.log(`📖 Extraindo texto de: ${busca.data.files[0].name}`);

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    
    // Agora usamos o motor do PDF.js
    const textoPDF = await extrairTextoPDF(res.data);

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const contextoAulas = Object.values(cache).map(c => `${c.nome}: ${c.resumo}`).join('\n');

    console.log("--- 🧠 Gerando Insight Comparativo ---");
    const analise = await analisarComComparacao(textoPDF, contextoAulas);

    console.log("\n--- 🎓 INSIGHTS DO TUTOR (LIVRO VS AULA) ---");
    console.log(analise);

  } catch (error) {
    console.error("❌ Erro no Processamento:", error.message);
  }
}

processarPDF();
