import { ZULRAH_PHASES, hydraPhase, hydraBreakTarget, isGuardian, graardorIsArmoured, nexIsShielded, nexWard, NEX_ACOLYTES, STALL_MAX_STACKS } from '../../systems/boss-mechanics';
import type { GameRenderer } from '../renderer';
import { GUARDIAN_LINK_COLOR, CORP_LINK_COLOR } from './shared';

/**
 * On-canvas HUD: the boss health bar, the low-health warning and the leak flash.
 * Everything else in the interface is React (see components/game).
 */

/** Brief full-screen red wash when the base takes a leak. */
export function drawLeakFlash(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const bf = gr.e.baseFlash;
  if (bf <= 0) return;
  ctx.fillStyle = `rgba(180,0,0,${bf * 0.14})`;
  ctx.fillRect(0, 0, gr.e.width, gr.e.height);
}

/** Soft darkened edges to focus the eye on the battlefield. */
export function drawVignette(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const w = gr.e.width;
  const h = gr.e.height;
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** Large boss health bar across the top while a boss is on the field. */
export function drawBossBar(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const boss = gr.e.enemies.find(en => en.isBoss);
  if (!boss) return;
  const w = gr.e.width;
  const barW = Math.min(560, w * 0.5);
  const barH = 16;
  const x = (w - barW) / 2;
  const y = 18;
  const ratio = Math.max(0, boss.hp / boss.maxHp);

  ctx.save();
  // frame
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);
  ctx.fillStyle = '#2a0606';
  ctx.fillRect(x, y, barW, barH);
  // fill
  const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
  grad.addColorStop(0, '#e23a3a');
  grad.addColorStop(1, '#8a0000');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, barW * ratio, barH);
  ctx.strokeStyle = '#c8a44a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);
  // label
  ctx.fillStyle = '#ffcb05';
  ctx.font = "bold 14px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${boss.name}   ${Math.ceil(boss.hp)} / ${boss.maxHp}`, w / 2, y + barH / 2 + 1);
  const st = boss.bossState;

  // A Guardian's twin gets its own bar, butted right up against the first: one health
  // bar could never ask the question the fight is built on — "are they going down
  // *together*?" — and stacking them touching is what makes them read as one pair
  // rather than two bosses who happen to share a wave. Everything below (the caption,
  // the Hydra's break bar) is pushed down by however tall this came out.
  const twin = isGuardian(st?.kind) && st!.partnerId
    ? gr.e.enemies.find((en) => en.id === st!.partnerId)
    : undefined;
  let below = y + barH; // where the next row starts
  if (twin) {
    const th = 13;
    const ty = below + 2;
    const tr = Math.max(0, twin.hp / twin.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 4, ty - 2, barW + 8, th + 4);
    ctx.fillStyle = '#2a0606';
    ctx.fillRect(x, ty, barW, th);
    const g2 = ctx.createLinearGradient(x, 0, x + barW, 0);
    g2.addColorStop(0, '#e23a3a');
    g2.addColorStop(1, '#8a0000');
    ctx.fillStyle = g2;
    ctx.fillRect(x, ty, barW * tr, th);
    ctx.strokeStyle = '#c8a44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, ty, barW, th);
    ctx.fillStyle = '#ffcb05';
    ctx.font = "bold 12px 'RuneScape', Arial";
    ctx.fillText(`${twin.name}   ${Math.ceil(twin.hp)} / ${twin.maxHp}`, w / 2, ty + th / 2 + 1);
    below = ty + th;
  }

  // Phase caption under the bar(s): Zulrah's current form (weak style) or Vorkath's
  // ice-shield warning — so the mechanic is legible without watching the tint.
  let caption: string | null = null;
  let capColor = '#cfe8ff';
  if (st?.kind === 'zulrah') {
    const phase = ZULRAH_PHASES[st.phaseIndex % ZULRAH_PHASES.length];
    caption = `${phase.name}, weak to ${phase.weak}`;
    capColor = phase.color;
  } else if (st?.kind === 'vorkath' && st.immune) {
    caption = 'ICE SHIELD: immune!';
    capColor = '#bfe9ff';
  } else if (st?.kind === 'jad' && boss.hp <= boss.maxHp * 0.5 && gr.e.enemies.some(en => en.healer)) {
    caption = 'Healers active: kill them!';
    capColor = '#7dff9a';
  } else if (st?.kind === 'hydra') {
    const phase = hydraPhase(st.shattered ?? 0);
    if (st.venting) {
      caption = 'CHEMICAL VENT: break it!';
      capColor = '#b6ff6a';
    } else if (st.enraged) {
      caption = 'ENRAGED!';
      capColor = '#ff7a4c';
    } else {
      caption = `${phase.name} phase`;
      capColor = phase.color;
    }
  } else if (st?.kind === 'giant_mole') {
    capColor = '#d9b184';
    if (st.molePhase === 'dig') caption = 'DIGGING: it will surface ahead!';
    else if (st.molePhase === 'under') caption = 'BURROWED: untouchable!';
    else if (st.molePhase === 'emerge') caption = 'Surfacing: hit it now!';
    else if (st.burrows) caption = `Burrows: ${st.burrows}`;
  } else if (st?.kind === 'cerberus') {
    const locked = st.lockedStyles ?? [];
    if (locked.length) {
      // Name the styles that are locked, not the count: "2 souls" tells the player
      // nothing they can act on, and which styles are dead is the whole decision.
      caption = `SOULS: ${locked.join(', ')} locked!`;
      capColor = '#b7c6dd';
    } else if (st.enraged) {
      caption = 'ENRAGED!';
      capColor = '#ff7a4c';
    }
  } else if (isGuardian(st?.kind)) {
    capColor = GUARDIAN_LINK_COLOR;
    if (st!.linked) {
      caption = 'SHARED STONE: both take half damage';
    } else if (st!.reviveTimer !== undefined) {
      // The number is the whole mechanic: it is the clock the player is racing.
      caption = `ENRAGED: reviving its twin in ${Math.ceil(st!.reviveTimer)}s!`;
      capColor = '#ff8b4c';
    }
  } else if (st?.kind === 'kbd') {
    capColor = '#ff9d3d';
    // Three things, in the order the player needs them: the warning, the effect, and
    // then — once the fire is out — the count, so "how often does he do that" is
    // answerable from the bar alone.
    if (st.kbdPhase === 'inhale') caption = 'INHALING: that stretch is about to burn!';
    else if (gr.e.scorches.some((sc) => !sc.warning)) caption = 'DRAGONFIRE: towers over the flames hit for half!';
    else if (st.breaths) caption = `Breaths: ${st.breaths}`;
  } else if (st?.kind === 'corporeal_beast') {
    capColor = CORP_LINK_COLOR;
    // The armour and the theft are one state, so they get one line — and it names the
    // answer, because "kill the core" is the entire fight and nothing else works.
    if ((st.coresLatched ?? 0) > 0) caption = 'SIPHONING: kill the core to free your tower!';
    else if (st.coresSpat) caption = `Cores spat: ${st.coresSpat}`;
  } else if (st?.kind === 'graardor') {
    capColor = '#d9b24a';
    // The armour and its answer are one line, and it names the answer, because the
    // sergeants are the entire fight. Once they are down the line becomes the slam
    // count, which is the other half: how many times the interface has gone dark.
    if ((st.slamWindup ?? 0) > 0) caption = 'SLAM INCOMING: your prayers are about to break!';
    else if (graardorIsArmoured(st)) caption = 'BODYGUARDS: kill the sergeants in front of him!';
    else if (st.slams) caption = `Slams: ${st.slams}`;
  } else if (st?.kind === 'nex') {
    capColor = '#c9a0ff';
    // The line names the acolyte, because "kill that one" is the entire fight and the
    // player has four different names to keep straight. Once every ward is spent it
    // becomes the count, which is the fight's own scoreboard.
    const ward = nexWard(st);
    if (nexIsShielded(st) && ward) caption = `WARDED: kill ${ward.name} to reach her!`;
    else if ((st.nexPhase ?? 0) >= NEX_ACOLYTES.length) caption = 'No acolytes left, she stands alone!';
    else if (st.nexWardsBroken) caption = `Acolytes down: ${st.nexWardsBroken}/${NEX_ACOLYTES.length}`;
  }
  if (caption) {
    ctx.font = "bold 12px 'RuneScape', Arial";
    ctx.fillStyle = capColor;
    ctx.fillText(caption, w / 2, below + 11);
    below += 18;
  }
  // The stall breaker gets its own line rather than replacing the phase caption: it
  // fires exactly when the player is most confused about why the fight isn't moving,
  // and that is the worst possible moment to hide the mechanic they're failing.
  const stacks = st?.stallStacks ?? 0;
  if (stacks > 0) {
    ctx.font = "bold 12px 'RuneScape', Arial";
    ctx.fillStyle = '#ffcb05';
    ctx.fillText(
      `BREAKING FREE ${stacks}/${STALL_MAX_STACKS}: it is shrugging off your control!`,
      w / 2, below + 11,
    );
    below += 18;
  }
  // The Hydra's break bar: how close the landed damage is to shattering the open
  // vent. It sits right under the caption, so the player watches one thing.
  if (st?.kind === 'hydra' && st.venting) {
    const p = Math.min(1, (st.ventDamage ?? 0) / hydraBreakTarget(boss.maxHp));
    const bh = 5;
    const by2 = below;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, by2 - 1, barW + 2, bh + 2);
    ctx.fillStyle = '#1d2a12';
    ctx.fillRect(x, by2, barW, bh);
    ctx.fillStyle = '#b6ff6a';
    ctx.fillRect(x, by2, barW * p, bh);
    ctx.strokeStyle = '#c8a44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, by2, barW, bh);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/** Pulsing red screen edge when the player is down to their last few lives. */
export function drawLowHealthWarning(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  if (gr.e.gameOver || gr.e.lives <= 0 || gr.e.lives > 5) return;
  const w = gr.e.width;
  const h = gr.e.height;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 4);
  // Stronger as lives approach zero, breathing via the pulse.
  const intensity = (1 - (gr.e.lives - 1) / 5) * (0.25 + pulse * 0.35);
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(200,0,0,0)');
  grad.addColorStop(1, `rgba(200,0,0,${intensity})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
