/**
 * Farming skill – harvest and replant crops.
 * Lazy getter so bot.bot is resolved at call time, not construction time.
 */
class FarmingSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
  }

  get bot() { return this.botInstance.bot; }

  async farm(task) {
    const { action, crop, player } = task;
    if (!action || !crop) {
      this.bot.chat('❓ Farming command missing action or crop.');
      return;
    }
    this.bot.chat(`🌱 ${action} ${crop} for ${player} (stub – full farming coming soon)`);
    this.bot.chat('✅ Farming task acknowledged.');
  }
}

module.exports = FarmingSkill;
