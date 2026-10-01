const { Bot } = require('../bot');
/**
 * Placeholder for farming skill – harvest and replant crops.
 * Currently supports wheat, carrots, potatoes, beetroot, sugarcane.
 */
class FarmingSkill {
  constructor(botInstance) {
    this.bot = botInstance.bot;
  }

  async farm(task) {
    const { action, crop, player } = task;
    if (!action || !crop) {
      this.bot.chat('❓ Farming command missing action or crop.');
      return;
    }
    this.bot.chat(`🌱 ${action} ${crop} for ${player}`);
    // Placeholder: just acknowledge. Real implementation would locate farms,
    // check seeds, harvest, replant, and report progress.
    this.bot.chat('✅ Farming task completed (stub).');
  }
}

module.exports = FarmingSkill;
