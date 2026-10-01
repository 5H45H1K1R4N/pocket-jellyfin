'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MovementSkill = require('../src/skills/movement');

test('follow remains active until explicitly cancelled', async () => {
  let goal;
  let stopped = false;
  const player = { entity: { position: { x: 1, y: 64, z: 1 } } };
  const bot = {
    players: { Steve: player },
    pathfinder: { setGoal(value) { goal = value; }, stop() { stopped = true; } },
    chat() {},
  };
  const goals = { GoalFollow: class { constructor(entity, distance) { this.entity = entity; this.distance = distance; } } };
  const skill = new MovementSkill({ bot }, goals);

  let finished = false;
  const follow = skill.follow('Steve').then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(goal.entity, player.entity);
  assert.equal(finished, false);

  skill.cancel();
  await follow;
  assert.equal(stopped, true);
  assert.equal(finished, true);
});

test('come awaits arrival through pathfinder.goto', async () => {
  let receivedGoal;
  const bot = {
    players: { Alex: { entity: { position: { x: 4, y: 65, z: -2 } } } },
    pathfinder: { goto: async goal => { receivedGoal = goal; } },
    chat() {},
  };
  const goals = { GoalNear: class { constructor(x, y, z, range) { Object.assign(this, { x, y, z, range }); } } };
  await new MovementSkill({ bot }, goals).come('Alex');
  assert.equal(receivedGoal.x, 4);
  assert.equal(receivedGoal.y, 65);
  assert.equal(receivedGoal.z, -2);
  assert.equal(receivedGoal.range, 1);
});