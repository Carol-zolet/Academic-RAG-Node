import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./indice_estudos.json', 'utf8'));

console.log("📊 MAPA DE CONHECIMENTO INDEXADO:");
console.table(Object.keys(data).map(materia => ({
    Materia: materia,
    Caracteres: data[materia].length,
    Status: data[materia].length > 0 ? "✅ Pronto" : "⚠️ Vazio"
})));
