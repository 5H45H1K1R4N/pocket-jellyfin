'use strict';

/**
 * MockProvider — fully offline command parser for Peppy.
 * Returns a task object or null if nothing matches.
 */

function normalizeBlock(str) {
  return str.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeCrop(str) {
  return normalizeBlock(str).replace('sugar_cane', 'sugarcane');
}

class MockProvider {
  /**
   * Parse a raw chat command into a task descriptor.
   * @param {string} message - The command text (after trigger word removed)
   * @param {string} playerName - The username who sent it
   * @returns {object|null}
   */
  parseCommand(message, playerName) {
    const player = playerName;
    let m;

    // 1. mine / dig / collect <n> <block>
    m = message.match(/^(mine|dig|collect)\s+(\d+)\s+(.+)/i);
    if (m) return { task: 'mine', target: normalizeBlock(m[3]), amount: parseInt(m[2], 10), player };

    // 2. harvest <crop>
    m = message.match(/^harvest\s+(.+)/i);
    if (m) return { task: 'farm', action: 'harvest', crop: normalizeCrop(m[1]), player };

    // 3. plant <crop>
    m = message.match(/^plant\s+(.+)/i);
    if (m) return { task: 'farm', action: 'plant', crop: normalizeCrop(m[1]), player };

    // 4. farm / maintain <crop>
    m = message.match(/^(farm|maintain)\s+(.+)/i);
    if (m) return { task: 'farm', action: 'maintain', crop: normalizeCrop(m[2]), player };

    // 5. follow me / follow (bare)
    if (/^follow\s+me$/i.test(message) || /^follow$/i.test(message)) {
      return { task: 'follow', player };
    }

    // 6. follow <username>
    m = message.match(/^follow\s+(\w+)$/i);
    if (m) return { task: 'follow', player: m[1] };

    // 7. come here / come to me / come
    if (/^come(\s+here|\s+to\s+me)?$/i.test(message)) {
      return { task: 'come', player };
    }

    // 8. come to <username>
    m = message.match(/^come\s+to\s+(\w+)$/i);
    if (m) return { task: 'come', player: m[1] };

    // 9. stop / halt / freeze
    if (/(stop|halt|freeze)/i.test(message)) return { task: 'stop', player };

    // 10. cancel / abort
    if (/(cancel|abort)/i.test(message)) return { task: 'cancel', player };

    // 11. status / what are you doing / busy
    if (/(status|what.*doing|busy)/i.test(message)) return { task: 'status', player };

    // 12. inventory / inv / items / what do you have
    if (/(inventory|inv\b|items|what.*have)/i.test(message)) return { task: 'inventory', player };

    // 13. health / hp / how are you
    if (/(health|hp\b|how.*are)/i.test(message)) return { task: 'health', player };

    // 14. build / make / construct <structure>
    m = message.match(/^(build|make|construct)\s+(.+)/i);
    if (m) return { task: 'build', structure: normalizeBlock(m[2]), player };

    // 15. attack / kill / fight <target>
    m = message.match(/^(attack|kill|fight)\s+(.+)/i);
    if (m) return { task: 'attack', target: m[2].trim(), player };

    // 16. defend
    if (/^defend$/i.test(message)) return { task: 'defend', player };

    // 17. help
    if (/^help$/i.test(message)) return { task: 'help', player };

    // 18. craft / smelt <item>
    m = message.match(/^(craft|smelt)\s+(.+)/i);
    if (m) return { task: 'craft', item: m[2].trim(), player };

    return null;
  }
}

module.exports = MockProvider;
