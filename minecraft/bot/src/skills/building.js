/**
 * Building skill – predefined blueprint placement.
 * Lazy getter so bot.bot is resolved at call time, not construction time.
 */
class BuildingSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
  }

  get bot() { return this.botInstance.bot; }

  async build(task) {
    const { structure, player } = task;
    if (!structure) {
      this.bot.chat('❓ Build command missing structure name.');
      return;
    }
    this.bot.chat(`🏗️ Building ${structure} for ${player} (stub – full building coming soon)`);
    this.bot.chat('✅ Build task acknowledged.');
  }
}

module.exports = BuildingSkill;
