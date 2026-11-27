// Rehearse the published format. In dual-clock stages the demo alternates
// thirty-second turns; each team still uses exactly its own allocated time.
export function climbTimeline(format) {
  const totals = { pro:0, con:0 };
  const turns = [];
  let duration = 0;
  function add(stage, side, seconds, clockAtStart = seconds) {
    turns.push({ stage, side, start:duration, end:duration+seconds, clockAtStart, used:{...totals} });
    duration += seconds;
    if (side) totals[side] += seconds;
  }
  for (const stage of format.stages) {
    if (stage.type === 'dual') {
      const left = { pro:stage.secs, con:stage.secs };
      let side = stage.first === 'con' ? 'con' : 'pro';
      while (left.pro || left.con) {
        const seconds = Math.min(30, left[side]);
        if (seconds) add(stage,side,seconds,left[side]);
        left[side] -= seconds;
        side = side === 'pro' ? 'con' : 'pro';
      }
    } else {
      add(stage, stage.type === 'break' ? null : stage.side, stage.secs);
    }
  }
  const next={pro:duration,con:duration};
  for (let i=turns.length-1;i>=0;i--) {
    const part=turns[i];
    if (part.side) {part.nextStart=next[part.side];next[part.side]=part.start;}
  }
  function at(seconds,speed=1) {
    const t = Math.max(0,Math.min(seconds,duration));
    const turn = turns.find(part => part.end > t) || turns[turns.length-1];
    const used = {...turn.used};
    if (turn.side) used[turn.side] += t - turn.start;
    return { stage:turn.stage.name, side:turn.side, used, remaining:turn.clockAtStart-(t-turn.start),
      footprintClock:{now:t,at:landedAt,settledAt(side,from,to,settle) {
        const low=from*totals[side],high=to*totals[side],delay=settle*speed;
        for (const part of turns) {
          if (part.side!==side) continue;
          const end=part.used[side]+part.end-part.start;
          if (end>=high) break;
          if (end<low-1e-9) continue;
          if (part.end+delay<=Math.min(part.nextStart,t)) return part.end+delay;
        }
        return null;
      }},
      progress:{ pro:used.pro/totals.pro, con:used.con/totals.con }, finished:t >= duration };
  }
  function landedAt(side,p) {
    const used=p*totals[side];
    const turn=turns.find(t=>t.side===side && used<=t.used[side]+t.end-t.start);
    return turn?turn.start+used-turn.used[side]:duration;
  }
  return {duration,totals,at};
}
