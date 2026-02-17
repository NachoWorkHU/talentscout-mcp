import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyDuNdLtnZghcHJfarSn3zMOgybaNPMeM8I";

async function listModels() {
    try {
        console.log("🔍 Consultando modelos disponibles...\n");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
        );

        if (!response.ok) {
            console.error(`HTTP Error: ${response.status} ${response.statusText}`);
            const body = await response.text();
            console.error("Body:", body);
            return;
        }

        const data = await response.json();

        if (!data.models || data.models.length === 0) {
            console.log("⚠️ No se encontraron modelos.");
            return;
        }

        // Filtrar solo modelos Gemini relevantes
        const geminiModels = data.models.filter((m) =>
            m.name.includes("gemini")
        );

        console.log(`✅ ${geminiModels.length} modelos Gemini encontrados:\n`);

        for (const model of geminiModels) {
            const supports = model.supportedGenerationMethods?.join(", ") || "N/A";
            console.log(`  📦 ${model.name}`);
            console.log(`     Display: ${model.displayName}`);
            console.log(`     Methods: ${supports}`);
            console.log("");
        }

        // Sugerir el mejor modelo para nuestro caso
        const flashModels = geminiModels.filter((m) => m.name.includes("flash"));
        if (flashModels.length > 0) {
            console.log("💡 Modelos Flash disponibles (recomendados):");
            flashModels.forEach((m) => console.log(`   → ${m.name}`));
        }
    } catch (e) {
        console.error("❌ Error listando modelos:", e);
    }
}

listModels();
