/* Haven 52 — site behaviour. Everything here is enhancement: the page reads
   and works without it. Motion follows the app's "cut" grammar: quick, clean,
   ease-out, never a loop; reduced motion swaps flights for instant state. */
(() => {
  'use strict';

  const doc = document;
  const $ = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => [...r.querySelectorAll(s)];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => !reduce.matches && typeof Element.prototype.animate === 'function';
  const wait = (ms) => new Promise((r) => setTimeout(r, motion() ? ms : 0));
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  const cardSVG = (id) => `<svg viewBox="0 0 210 311" aria-hidden="true"><use href="#card-${id}"/></svg>`;

  /* ---------- top bar turns solid once the page moves ---------- */
  const topbar = $('[data-topbar]');
  const syncBar = () => topbar && topbar.classList.toggle('is-solid', window.scrollY > 24);
  window.addEventListener('scroll', syncBar, { passive: true });
  syncBar();

  /* ---------- a card flight along a curve ---------- */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3.4);
  function flight(cardId, fromEl, toEl, o = {}) {
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const w0 = o.fromWidth || fromEl.offsetWidth;
    const w1 = toEl.offsetWidth;
    const h0 = (w0 * 311) / 210;
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const fly = doc.createElement('div');
    fly.className = 'pc flyer';
    fly.innerHTML = cardSVG(cardId);
    Object.assign(fly.style, {
      position: 'fixed', left: `${ax - w0 / 2}px`, top: `${ay - h0 / 2}px`,
      width: `${w0}px`, zIndex: 90, margin: '0',
    });
    doc.body.appendChild(fly);
    const dist = Math.hypot(dx, dy);
    const cx = dx * 0.5 + (o.bend || 0) * dist * 0.3;
    const cy = dy * 0.5 - Math.max(40, dist * 0.26);
    const s1 = w1 / w0;
    const r0 = o.fromRot || 0;
    const r1 = o.toRot || 0;
    const frames = [];
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const e = easeOut(i / N);
      const x = 2 * (1 - e) * e * cx + e * e * dx;
      const y = 2 * (1 - e) * e * cy + e * e * dy;
      const r = r0 + (r1 - r0) * e + Math.sin(Math.PI * e) * (o.spin ?? 7);
      const s = 1 + (s1 - 1) * e + Math.sin(Math.PI * e) * 0.07;
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})` });
    }
    const anim = fly.animate(frames, {
      duration: o.duration || 660, delay: o.delay || 0, easing: 'linear', fill: 'both',
    });
    return { landed: anim.finished, done: () => fly.remove() };
  }

  /* ---------- FLIP for cards that change parents ---------- */
  async function flipMove(els, mutate, duration = 560, stagger = 0) {
    const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    if (!motion()) return;
    const runs = els.map((el, i) => {
      const a = first.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
      return el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
        duration, delay: i * stagger, easing: EASE, fill: 'backwards',
      }).finished;
    });
    await Promise.all(runs.filter(Boolean));
  }

  /* ---------- the hand: play a card to change tables ---------- */
  const hand = $('[data-hand]');
  if (hand) {
    const GAMES = {
      seep: {
        card: 'KS', name: 'Seep', premise: 'One hundred points lie in the deck.',
        facts: [['Players', '2, or 4 in two teams'], ['Deck', '52 cards'], ['Modes', '1 round, 5 round, Baazi']],
      },
      bluff: {
        card: 'QH', name: 'Bluff', premise: 'Say what you played. It need not be true.',
        facts: [['Players', '2 to 5'], ['Deck', '52 cards'], ['Turn', '30 seconds']],
      },
      joker: {
        card: 'JK', name: 'Release the Joker', premise: 'One joker. Nobody wants to keep it.',
        facts: [['Players', '2 to 5'], ['Deck', '53 cards'], ['Turn', '30 seconds']],
      },
    };
    const tabs = $$('[role="tab"]', hand);
    const slot = $('[data-slot]');
    const slotCard = $('[data-slot-card]');
    const info = $('[data-slot-info]');
    const onTable = $('.vh', hand);
    const byGame = (g) => tabs.find((t) => t.dataset.game === g);
    const rotOf = (t) => Number(t.style.getPropertyValue('--i')) * 9;
    let current = 'seep';
    let busy = false;
    let suppressClick = false;

    const renderText = (g) => {
      const d = GAMES[g];
      const el = doc.createElement('div');
      el.className = 'slot-text';
      el.innerHTML =
        `<h2 class="slot-name${d.name.length > 10 ? ' is-long' : ''}">${d.name}</h2>` +
        `<p class="slot-premise">${d.premise}</p>` +
        `<dl class="facts facts-felt">${d.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` +
        `<a class="slot-more" href="#${g}">How a turn goes <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13M6 13l6 6 6-6"/></svg></a>`;
      return el;
    };

    function swapText(g) {
      const old = $('.slot-text', info);
      const fresh = renderText(g);
      info.appendChild(fresh);
      info.setAttribute('aria-labelledby', byGame(g).id);
      if (!motion()) { old.remove(); return; }
      old.setAttribute('aria-hidden', 'true');
      old.animate(
        [{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', opacity: 1 },
         { clipPath: 'polygon(100% 0, 120% 0, 100% 100%, 80% 100%)', opacity: 0.3 }],
        { duration: 300, easing: 'cubic-bezier(.7, 0, .84, 0)', fill: 'forwards' },
      ).finished.then(() => old.remove());
      fresh.animate(
        [{ clipPath: 'polygon(0 0, 0 0, -20% 100%, -20% 100%)' },
         { clipPath: 'polygon(0 0, 120% 0, 100% 100%, -20% 100%)' }],
        { duration: 640, delay: 240, easing: EASE, fill: 'backwards' },
      );
    }

    function select(g) {
      tabs.forEach((t) => {
        const on = t.dataset.game === g;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      $('.hand-label', byGame(g)).appendChild(onTable);
    }

    function play(g, dragged) {
      if (busy || g === current) return;
      busy = true;
      const prev = current;
      current = g;
      const tab = byGame(g);
      const prevTab = byGame(prev);
      const use = $('use', slotCard);
      select(g);
      swapText(g);

      if (!motion()) {
        use.setAttribute('href', `#card-${GAMES[g].card}`);
        tab.classList.remove('is-lifted');
        tab.classList.add('is-played');
        prevTab.classList.remove('is-played');
        busy = false;
        return;
      }

      const src = dragged ? dragged.el : $('.pc', tab);
      const inbound = flight(GAMES[g].card, src, slotCard, {
        fromRot: dragged ? dragged.rot : rotOf(tab), toRot: -3, fromWidth: $('.pc', tab).offsetWidth,
        duration: dragged ? 520 : 680,
      });
      if (dragged) dragged.el.remove();
      tab.classList.remove('is-lifted');
      tab.classList.add('is-played');
      const outbound = flight(GAMES[prev].card, slotCard, $('.pc', prevTab), {
        fromRot: -3, toRot: rotOf(prevTab), delay: 110, bend: -0.35, duration: 640, spin: -6,
      });
      slotCard.style.visibility = 'hidden';

      Promise.all([
        inbound.landed.then(() => {
          use.setAttribute('href', `#card-${GAMES[g].card}`);
          slotCard.style.visibility = '';
          inbound.done();
          slotCard.animate(
            [{ transform: 'rotate(-3deg) scale(1.03)' }, { transform: 'rotate(-3deg) scale(1)' }],
            { duration: 320, easing: EASE },
          );
        }),
        outbound.landed.then(() => {
          prevTab.classList.remove('is-played');
          outbound.done();
        }),
      ]).finally(() => { busy = false; });
    }

    tabs.forEach((t) => t.addEventListener('click', () => {
      if (suppressClick) return;
      play(t.dataset.game);
    }));

    hand.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(doc.activeElement);
      if (i < 0) return;
      const n = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      tabs[n].focus();
    });

    /* Drag a card onto the table (mouse and pen; touch taps). */
    let drag = null;
    const overSlot = (x, y) => {
      const r = slot.getBoundingClientRect();
      return x > r.left - 70 && x < r.right + 70 && y > r.top - 70 && y < r.bottom + 70;
    };
    hand.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0 || !motion() || busy) return;
      const t = e.target.closest('[role="tab"]');
      if (!t || t.classList.contains('is-played')) return;
      drag = { t, x0: e.clientX, y0: e.clientY, id: e.pointerId, started: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 8) return;
        drag.started = true;
        const pc = $('.pc', drag.t);
        const r = pc.getBoundingClientRect();
        const w = pc.offsetWidth;
        const h = (w * 311) / 210;
        const el = doc.createElement('div');
        el.className = 'pc flyer';
        el.innerHTML = cardSVG(GAMES[drag.t.dataset.game].card);
        Object.assign(el.style, {
          position: 'fixed', left: `${r.left + r.width / 2 - w / 2}px`, top: `${r.top + r.height / 2 - h / 2}px`,
          width: `${w}px`, zIndex: 90, margin: '0',
        });
        doc.body.appendChild(el);
        drag.el = el;
        drag.rot0 = rotOf(drag.t);
        drag.t.classList.add('is-lifted');
        slot.classList.add('is-armed');
        doc.documentElement.style.userSelect = 'none';
      }
      drag.rot = drag.rot0 * Math.max(0, 1 - Math.abs(dy) / 220) + dx * 0.02;
      drag.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${drag.rot}deg) scale(1.05)`;
      slot.classList.toggle('is-over', overSlot(e.clientX, e.clientY));
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.started) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      slot.classList.remove('is-armed', 'is-over');
      doc.documentElement.style.userSelect = '';
      const dy = e.clientY - d.y0;
      if (e.type === 'pointerup' && (overSlot(e.clientX, e.clientY) || dy < -120)) {
        play(d.t.dataset.game, d);
        return;
      }
      d.el.animate(
        [{ transform: d.el.style.transform }, { transform: `translate(0px, 0px) rotate(${d.rot0}deg) scale(1)` }],
        { duration: 420, easing: EASE, fill: 'forwards' },
      ).finished.then(() => { d.el.remove(); d.t.classList.remove('is-lifted'); });
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  /* ---------- Seep: a sweep ---------- */
  const seep = $('[data-demo="seep"]');
  if (seep) {
    const stage = $('.demo-stage', seep);
    const initial = stage.innerHTML;
    const btn = $('[data-act="play"]', seep);
    const says = $('[data-says]', seep);
    const firstWords = says.innerHTML;
    let state = 'ready';
    btn.addEventListener('click', async () => {
      if (state === 'busy') return;
      if (state === 'done') {
        stage.innerHTML = initial;
        says.innerHTML = firstWords;
        btn.textContent = 'Play the 9 of diamonds';
        state = 'ready';
        return;
      }
      state = 'busy';
      btn.disabled = true;
      const floor = $('[data-floor]', stage);
      const pile = $('[data-pile]', stage);
      const row = $('[data-hand-row]', stage);
      const chips = $('[data-score]', stage);
      const nine = $('[data-c="9D"]', row);
      nine.classList.remove('is-target');
      await flipMove([...floor.children, ...row.children], () => floor.appendChild(nine), 600);
      says.innerHTML = 'Everything on the floor that adds up to 9 must be taken: the 4 and 5 together, and the 9 of clubs.';
      await wait(900);
      const taken = [...floor.children];
      await flipMove(taken, () => taken.forEach((c, n) => {
        c.style.setProperty('--n', n);
        c.style.setProperty('--rr', `${[-6, 4, -2, 7][n]}deg`);
        pile.appendChild(c);
      }), 640, 70);
      chips.classList.add('is-on');
      says.innerHTML = '<strong>Sweep.</strong> The floor is empty, which is worth 50, and the 4 of spades scores 4. The other three cards score nothing.';
      btn.textContent = 'Deal it again';
      btn.disabled = false;
      state = 'done';
    });
  }

  /* ---------- Bluff: call it or let it go ---------- */
  const bluff = $('[data-demo="bluff"]');
  if (bluff) {
    const stage = $('.demo-stage', bluff);
    const initial = stage.innerHTML;
    const says = $('[data-says]', bluff);
    const firstWords = says.innerHTML;
    const choices = $('[data-choices]', bluff);
    const again = $('[data-act="reset"]', bluff);
    let busy = false;
    bluff.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act || busy) return;
      if (act === 'reset') {
        stage.innerHTML = initial;
        says.innerHTML = firstWords;
        again.hidden = true;
        choices.hidden = false;
        $('[data-act="challenge"]', bluff).focus();
        return;
      }
      busy = true;
      choices.hidden = true;
      const claim = $('[data-claim]', stage);
      const pile = $('[data-bpile]', stage);
      const claimant = $('[data-claimant]', stage);
      if (act === 'challenge') {
        $$('[data-flip]', claim).forEach((f) => f.classList.add('is-up'));
        says.innerHTML = 'Only the challenged cards turn over. A 7 among the kings: <strong>the claim was a lie, so they pick up the whole pile.</strong>';
        await wait(1400);
        if (motion()) {
          const c = claimant.getBoundingClientRect();
          const p = pile.getBoundingClientRect();
          const dy = c.top + c.height / 2 - (p.top + p.height / 2);
          const dx = c.left + 17 - (p.left + p.width / 2);
          await Promise.all([pile, claim].map((t, i) => t.animate(
            [{ translate: '0px 0px', scale: '1', opacity: 1 }, { translate: `${dx}px ${dy}px`, scale: '.3', opacity: 0 }],
            { duration: 720, delay: i * 50, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'forwards' },
          ).finished));
        }
      } else {
        says.innerHTML = 'No challenge, so nothing is shown. The two cards join the pile. <strong>Your turn: put down cards and call them kings, or pass.</strong>';
        if (motion()) {
          await claim.animate(
            [{ translate: '0% 0%' }, { translate: '-30% -9%' }],
            { duration: 560, easing: EASE, fill: 'forwards' },
          ).finished;
        }
      }
      again.hidden = false;
      again.focus({ preventScroll: true });
      busy = false;
    });
  }

  /* ---------- Release the Joker: draw blind ---------- */
  const joker = $('[data-demo="joker"]');
  if (joker) {
    const stage = $('.demo-stage', joker);
    const initial = stage.innerHTML;
    const says = $('[data-says]', joker);
    const firstWords = says.innerHTML;
    const again = $('[data-act="reset"]', joker);
    const POOL = [
      { id: '7H', r: '7', name: 'the 7 of hearts', plural: 'sevens' },
      { id: 'QS', r: 'Q', name: 'the queen of spades', plural: 'queens' },
      { id: '9S', r: '9', name: 'the 9 of spades' },
      { id: 'JK', r: 'JK', name: 'the joker' },
    ];
    let deal = [];
    let busy = false;
    const shuffle = (list) => {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const arm = () => {
      deal = shuffle(POOL);
      busy = false;
      $$('.draw', stage).forEach((b, i) => { $('.face-front use', b).setAttribute('href', `#card-${deal[i].id}`); });
    };
    arm();

    stage.addEventListener('click', async (e) => {
      const b = e.target.closest('.draw');
      if (!b || busy || b.disabled) return;
      busy = true;
      const draws = $$('.draw', stage);
      const card = deal[draws.indexOf(b)];
      const their = $('[data-their]', stage);
      const yours = $('[data-yours]', stage);
      const out = $('[data-discard]', stage);
      draws.forEach((d) => { d.disabled = true; });
      their.classList.add('is-done');
      const f = $('.flip', b);
      f.setAttribute('role', 'img');
      f.setAttribute('aria-label', card.name);
      await flipMove([f, ...yours.children], () => { yours.appendChild(f); b.classList.add('is-taken'); }, 640);
      f.classList.add('is-up');
      await wait(720);
      if (card.r === 'JK') {
        says.innerHTML = 'You drew <strong>the joker</strong>. It pairs with nothing, so now somebody has to draw it from you.';
      } else {
        const mate = $(`[data-r="${card.r}"]`, yours);
        if (mate) {
          says.innerHTML = `You drew ${card.name}: a pair of ${card.plural}. Suits do not matter, so <strong>both go out</strong>.`;
          const pair = [mate, f];
          await flipMove(pair, () => pair.forEach((el, n) => {
            el.style.setProperty('--n', String(n));
            el.style.setProperty('--rr', `${n ? 7 : -5}deg`);
            out.appendChild(el);
          }), 620, 90);
        } else {
          says.innerHTML = 'You drew the 9 of spades and hold no 9, so <strong>it stays in your hand</strong>. The joker is still out there.';
        }
      }
      again.hidden = false;
    });
    again.addEventListener('click', () => {
      stage.innerHTML = initial;
      says.innerHTML = firstWords;
      again.hidden = true;
      arm();
      $('.draw', stage).focus();
    });
  }

  /* ---------- the cut opens once ---------- */
  const cut = $('[data-cut]');
  if (cut && motion() && 'IntersectionObserver' in window) {
    const r = cut.getBoundingClientRect();
    if (r.top > window.innerHeight) {
      cut.classList.add('is-armed');
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          cut.classList.remove('is-armed');
          io.disconnect();
        }
      }, { threshold: 0.28 });
      io.observe(cut);
    }
  }
})();
