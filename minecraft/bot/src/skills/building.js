/**
 * Building skill – executes predefined blueprints.
 * Expected task shape: { task: 'build', structure: '<name>', origin: {x,y,z}, player: '<username>' }
 * For now this is a stub that acknowledges the request.
 */
class BuildingSkill {
  constructor(botInstance) {
    this.bot = botInstance.bot;
  }

  async build(task) {
    const { structure, origin, player } = task;
    if (!structure) {
      this.bot.chat('❓ Build command missing structure name.');
      return;
    }
    this.bot.chat(`🏗️ Building ${structure} for ${player} (stub).`);
    // Real implementation would load a JSON blueprint from ./blueprints/<structure>.json
    // and place blocks relative to origin using bot.placeBlock.
    this.bot.chat('✅ Build task completed (stub).');
  }
}

module.exports = BuildingSkill;
