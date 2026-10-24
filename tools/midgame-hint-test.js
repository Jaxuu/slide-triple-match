'use strict';
const path=require('path');
const RE=require(path.join(__dirname,'..','src','core','RulesEngine.js'));
globalThis.STM=globalThis.STM||{};
globalThis.STM.RulesEngine=RE;
require(path.join(__dirname,'..','src','core','GameState.js'));
const GS=globalThis.STM.GameState;
const levels=require(path.join(__dirname,'..','src','data','levels.js'));
const LEVELS=Array.isArray(levels)?levels:(levels.LEVELS||globalThis.STM.LEVELS);
if(!LEVELS){ console.error('no levels'); process.exit(1); }

function run() {
  const levelDef=LEVELS[12]; // L13
  let session=GS.createSession(levelDef,{onEvent(){},onTerminal(){}});

  let steps=0;
  while (steps < 5 && session.state().phase === 'READY') {
    const taps=RE.enumerateTaps(session.engineState());
    if (!taps.length) break;
    const tid=taps[steps % taps.length];
    session.tap(tid);
    steps++;
  }
  console.log('after manual taps, phase=', session.state().phase, 'dock=', session.state().dock.length);

  let id = session.findBestMove();
  console.log('findBestMove() =', id);
  if (typeof id !== 'number' || id < 0) { console.error('FAIL: invalid id'); process.exit(1); }

  let guard=0;
  let lastTiles=session.state().board.length;
  while (session.state().phase === 'READY' && guard < 200) {
    id = session.findBestMove();
    if (id < 0) { console.error('FAIL: no move'); process.exit(1); }
    const board=session.state().board;
    const exists=board.some(t=>t.id===id && !t.removed);
    if (!exists) { console.error('FAIL: tile not on board', id); process.exit(1); }
    session.tap(id);
    guard++;
    if (guard % 5 === 0) {
      console.log('step',guard,'tiles',session.state().board.length,'dock',session.state().dock.length,'phase',session.state().phase);
    }
    if (session.state().board.length === lastTiles && session.state().dock.length === 0) {
      // no progress
    }
    lastTiles=session.state().board.length;
  }
  console.log('phase after loop =', session.state().phase, 'steps=', guard);
  if (session.state().phase !== 'WON') { console.error('FAIL: not won'); process.exit(1); }
  console.log('MIDGAME HINT TEST: PASS');
}

run();
