// AI-функция на бесплатном ключе Google Gemini.
// Вызов с фронта: supabase.functions.invoke('ai', { body: { prompt, system } })
//
// Запуск (один раз):
//   1) Возьми бесплатный ключ: https://aistudio.google.com/apikey
//   2) Положи его в секрет:  npm run ai:secret -- GEMINI_API_KEY=твой_ключ
//   3) Задеплой функцию:     npm run ai:deploy
//
// Модель можно поменять (gemini-2.0-flash — быстрая и бесплатная).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';
const GAME_ONLY_SYSTEM = `You are the in-game assistant for Absolute cineWHAT?.
Only answer questions about this specific game: its menu, controls, gamemods, settings, lobby, arena, events, combat, shop, bots, zombies, duel mode, and visible gameplay rules.
If the user asks about anything outside the game, politely say you can only answer questions about the game.
Keep answers concise and practical.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Нет GEMINI_API_KEY. Поставь секрет: npm run ai:secret -- GEMINI_API_KEY=...');
    }
    const { prompt, system } = await req.json();
    if (!prompt) throw new Error('Нужно поле prompt');

    const systemText = system ? `${GAME_ONLY_SYSTEM}\n\nGame context:\n${system}` : GAME_ONLY_SYSTEM;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message ?? 'Gemini request failed');
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
