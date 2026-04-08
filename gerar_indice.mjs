import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config();

const ROOT_FOLDER_ID = '178JLC2zNL5c6bd9on-5fmPYrm3qnEDmn';

async function extrairTextoPDF(buffer) {
    try {
        const data = new Uint8Array(buffer);
        const loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        let textoCompleto = "";
        for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) { // Lendo até 30 páginas por arquivo
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            textoCompleto += content.items.map(item => item.str).join(" ") + " ";
        }
        return textoCompleto;
    } catch (e) {
        return "[Erro ao extrair texto deste PDF]";
    }
}

async function scanFolder(drive, folderId, folderName, indice) {
    console.log(`📂 Varrendo: ${folderName}`);
    
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)'
    });

    for (const file of res.data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            // Se for pasta, entra nela (Recursividade)
            await scanFolder(drive, file.id, `${folderName}/${file.name}`, indice);
        } else if (file.mimeType === 'application/pdf' || file.mimeType === 'text/plain') {
            console.log(`   📄 Lendo: ${file.name}`);
            try {
                const fileRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
                let texto = "";
                if (file.mimeType === 'application/pdf') {
                    texto = await extrairTextoPDF(fileRes.data);
                } else {
                    texto = Buffer.from(fileRes.data).toString('utf8');
                }
                
                // Armazena no índice usando o caminho da pasta como chave
                const materiaKey = folderName.split('/')[1] || "Geral";
                if (!indice[materiaKey]) indice[materiaKey] = "";
                indice[materiaKey] += `\n[FONTE: ${file.name}]\n${texto.substring(0, 5000)}\n`;
                console.log(`   ✅ Sucesso.`);
            } catch (err) {
                console.log(`   ❌ Erro em ${file.name}`);
            }
        }
    }
}

async function iniciarIndexacao() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID, 
        process.env.GOOGLE_CLIENT_SECRET, 
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(JSON.parse(fs.readFileSync('./tokens.json', 'utf8')));
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let novoIndice = {};
    await scanFolder(drive, ROOT_FOLDER_ID, "Disciplinas", novoIndice);

    fs.writeFileSync('./indice_estudos.json', JSON.stringify(novoIndice, null, 2));
    console.log("\n✨ VARREDURA COMPLETA! Todas as subpastas foram processadas.");
}

iniciarIndexacao();
