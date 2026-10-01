const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
/**
 * RemoteProvider – stub for future LLM integration.
 * It would forward the raw command to a configured LLM API (e.g., OpenAI, Gemini)
 * and return a structured task JSON.
 * For now it simply returns null (unimplemented).
 */
class RemoteProvider {
  constructor() {
    this.apiKey = process.env.AI_API_KEY || '';
    this.model = process.env.AI_MODEL || '';
    // Add actual HTTP client logic when integrating a real provider.
  }

  async parseCommand(command, username) {
    // Placeholder – real implementation would call the LLM and parse the response.
    console.warn('RemoteProvider parseCommand called but not implemented');
    return null;
  }
}

module.exports = RemoteProvider;
