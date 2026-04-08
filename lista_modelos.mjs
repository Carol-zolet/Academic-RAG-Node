import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listarModelos() {
  try {
    console.log("--- 🔍 CONSULTANDO MODELOS DISPONÍVEIS ---");
    
    // O método listModels retorna a lista de modelos que sua chave pode usar
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();

    if (data.error) {
      console.error("❌ Erro na API:", data.error.message);
      return;
    }

    console.log("Modelos encontrados:");
    data.models.forEach(model => {
      // Filtramos apenas os que suportam gerar conteúdo (o que a gente quer)
      if (model.supportedGenerationMethods.includes("generateContent")) {
        console.log(`✅ Nome: ${model.name} | Descrição: ${model.displayName}`);
      }
    });

    console.log("\n--- DICA DE ADS ---");
    console.log("Use exatamente o texto que aparece depois de 'models/' no seu agente_ia.mjs");

  } catch (error) {
    console.error("❌ Erro ao conectar:", error.message);
  }
}

listarModelos();
