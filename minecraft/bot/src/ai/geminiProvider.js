'use strict';

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * GeminiProvider – Connects Peppy to Google Gemini API (Free tier).
 * Translates natural conversation, complex intent, or ambiguous requests
 * directly into validated Minecraft action tasks.
 * Falls back to mock rules if Gemini is unreachable or no key provided.
 */
class GeminiProvider {
  constructor(fallbackProvider) {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-1.5-flash';
    this.fallback = fallbackProvider || null;
  }

  async parseCommand(message, playerName, context = {}) {
    if (!this.apiKey) {
      if (this.fallback) return this.fallback.parseCommand(message, playerName);
      return null;
    }

    try {
      const prompt = this._buildPrompt(message, playerName, context);
      const rawResponse = await this._callGemini(prompt);
      const parsed = this._extractJson(rawResponse);

      if (parsed && parsed.task) {
        if (!parsed.player) parsed.player = playerName;
        return parsed;
      }
    } catch (err) {
      console.warn(`[GeminiProvider] LLM error (${err.message}). Falling back to rule parser...`);
    }

    // Gracefully fall back to local rule-based parsing if available
    if (this.fallback) {
      return this.fallback.parseCommand(message, playerName);
    }
    return null;
  }

  _buildPrompt(message, playerName, context) {
    return `You are Peppy, a helpful Minecraft assistant bot.
A player named "${playerName}" said: "${message}"

Bot context:
- Health: ${context.health ?? 20}/20
- Food: ${context.food ?? 20}/20
- Position: ${JSON.stringify(context.position || {})}
- Current inventory: ${JSON.stringify(context.inventory || [])}

Analyze the player's message and return ONLY a valid JSON object matching one of these schema types (no markdown, no extra text):

1. Mining / Gathering:
{"task": "mine", "target": "<block_name_in_snake_case>", "amount": <number>, "player": "${playerName}"}

2. Farming:
{"task": "farm", "action": "harvest"|"plant"|"maintain", "crop": "wheat"|"carrots"|"potatoes"|"beetroot"|"sugarcane", "player": "${playerName}"}

3. Building:
{"task": "build", "structure": "wheat_farm"|"small_house"|"basic_storage", "player": "${playerName}"}

4. Movement:
{"task": "follow"|"come"|"stop", "player": "${playerName}"}

5. Combat:
{"task": "attack", "target": "<mob_name>", "player": "${playerName}"}
OR
{"task": "defend", "player": "${playerName}"}

6. Management / Status:
{"task": "status"|"health"|"inventory"|"cancel"|"help", "player": "${playerName}"}

If the user request is conversational or not a task, answer politely using:
{"task": "chat", "message": "<your_short_in_game_reply>", "player": "${playerName}"}

Return ONLY raw JSON.`;
  }

  _callGemini(promptText) {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 256
        }
      });

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const resJson = JSON.parse(data);
              const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              resolve(text);
            } catch (e) {
              reject(new Error('Invalid JSON from Gemini API'));
            }
          } else {
            reject(new Error(`Gemini API HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Gemini API request timed out'));
      });

      req.write(payload);
      req.end();
    });
  }

  _extractJson(text) {
    if (!text) return null;
    const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch (e) {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (_) {}
      }
      return null;
    }
  }
}

module.exports = GeminiProvider;
