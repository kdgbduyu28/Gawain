import { describe, expect, it } from 'vitest';
import { Chore, daysLate, dueAt, dueNow, status, streak } from './chores';
import { Busy, Schedule, gapsOn, merge, remindAt, suggest } from './gaps';
import { Item, lastsDays, runOutAt, stock, withBought, withLevel } from './pantry';
import { awayText, plan } from './reminders';
import { DAY, MIN, at } from './time';

// Thursday 15 Oct 2026, 1:00 PM local.
const NOW = new Date(2026, 9, 15, 13, 0).getTime();
const day = (d: number) => NOW + d * DAY;

function chore(extra: Partial<Chore> = {}): Chore {
  return {
    id: extra.id ?? 'c1',
    name: 'Clean fridge',
    room: 'Kitchen',
    everyDays: 14,
    minutes: 20,
    where: 'home',
    lastDone: null,
    createdAt: day(-30),
    snoozedUntil: null,
    ...extra,
  };
}

function item(extra: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    name: 'Eggs',
    aisle: 'Dairy & eggs',
    store: null,
    note: '',
    level: 'full',
    onList: false,
    tracked: true,
    lastsDays: null,
    bought: [],
    addedAt: day(-60),
    ...extra,
  };
}

const SCHED: Schedule = {
  workDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '18:00',
  dayStart: '07:00',
  dayEnd: '22:00',
  maxWorkChore: 15,
  buffer: 5,
};

const busy = (from: string, to: string, title = 'Meeting'): Busy => ({ start: at(NOW, from), end: at(NOW, to), title });

describe('chore intervals', () => {
  it('counts from when it was last done, not a fixed date', () => {
    const c = chore({ lastDone: day(-10) });
    expect(dueAt(c)).toBe(day(4));
    expect(status(c, NOW)).toBe('later');
  });

  it('doing it late moves the next due date too', () => {
    const late = chore({ lastDone: day(-16) });
    expect(status(late, NOW)).toBe('overdue');
    expect(daysLate(late, NOW)).toBe(2);
    expect(dueAt({ ...late, lastDone: NOW })).toBe(day(14));
  });

  it('never-done repeating chores are "new", not overdue', () => {
    expect(status(chore(), NOW)).toBe('new');
  });

  it('snoozing pushes the due date without counting as done', () => {
    const c = chore({ lastDone: day(-15), snoozedUntil: day(1) });
    expect(status(c, NOW)).toBe('soon');
  });

  it('one-off chores are due from when they were added', () => {
    expect(status(chore({ everyDays: null, createdAt: day(-1) }), NOW)).toBe('overdue');
  });

  it('ranks a late daily chore above a late monthly one', () => {
    const daily = chore({ id: 'd', everyDays: 1, lastDone: day(-2) });
    const monthly = chore({ id: 'm', everyDays: 30, lastDone: day(-31) });
    expect(dueNow([monthly, daily], NOW).map((c) => c.id)).toEqual(['d', 'm']);
  });

  it('streak counts on-time completions back from the latest', () => {
    const h = [
      { choreId: 'c1', at: 1, late: 0 },
      { choreId: 'c1', at: 2, late: 3 },
      { choreId: 'c1', at: 3, late: 0 },
      { choreId: 'x', at: 4, late: 5 },
      { choreId: 'c1', at: 5, late: 0 },
    ];
    expect(streak(h, 'c1')).toBe(2);
  });
});

describe('pantry', () => {
  it('learns how long an item lasts from the median gap between purchases', () => {
    const i = item({ bought: [day(-30), day(-23), day(-16), day(-2)] });
    expect(lastsDays(i)).toBe(7);
    expect(runOutAt(i)).toBe(day(5));
  });

  it('needs two purchases before predicting, unless you set it yourself', () => {
    expect(lastsDays(item({ bought: [day(-3)] }))).toBeNull();
    expect(lastsDays(item({ bought: [day(-3)], lastsDays: 4 }))).toBe(4);
  });

  it('flags items predicted to run out within two days', () => {
    expect(stock(item({ bought: [day(-3)], lastsDays: 4 }), NOW)).toBe('soon');
    expect(stock(item({ bought: [day(-1)], lastsDays: 10 }), NOW)).toBe('ok');
  });

  it('marking low puts it on the list; buying restocks it and records the purchase', () => {
    const low = withLevel(item(), 'low');
    expect(low.onList).toBe(true);
    const bought = withBought(low, NOW);
    expect(bought).toMatchObject({ level: 'full', onList: false, bought: [NOW] });
  });
});

describe('calendar gaps', () => {
  it('finds the free time between meetings, split at work hours', () => {
    const gaps = gapsOn(NOW, [busy('13:30', '14:00', 'Standup'), busy('14:00', '15:00'), busy('16:00', '17:00')], SCHED, NOW);
    expect(gaps.map((g) => [new Date(g.start).getHours() * 60 + new Date(g.start).getMinutes(), g.minutes, g.work])).toEqual([
      [13 * 60, 30, true],
      [15 * 60, 60, true],
      [17 * 60, 60, true],
      [18 * 60, 240, false],
    ]);
    expect(gaps[0].next?.title).toBe('Standup');
    expect(gaps[2].next).toBeNull();
  });

  it('merges overlapping meetings', () => {
    expect(merge([busy('10:00', '11:00'), busy('10:30', '11:30'), busy('12:00', '12:30')]).length).toBe(2);
  });

  it('suggests short chores during work and bigger ones after, keeping a buffer', () => {
    const chores = [
      chore({ id: 'dishes', name: 'Unload dishwasher', minutes: 10, everyDays: 1, lastDone: day(-1) }),
      chore({ id: 'bath', name: 'Clean bathroom', minutes: 45, everyDays: 7, lastDone: day(-8) }),
      chore({ id: 'trash', name: 'Take out trash', minutes: 5, where: 'out', everyDays: 2, lastDone: day(-3) }),
    ];
    const gaps = gapsOn(NOW, [busy('13:20', '18:00')], SCHED, NOW);
    const s = suggest(gaps, chores, SCHED, NOW);
    expect(s.map((x) => x.chores.map((c) => c.id))).toEqual([['dishes'], ['bath']]);
  });

  it('does not suggest a chore that would run into the next meeting', () => {
    const gaps = gapsOn(NOW, [busy('13:12', '18:00')], SCHED, NOW);
    expect(suggest(gaps, [chore({ minutes: 10, everyDays: 1, lastDone: day(-1) })], SCHED, NOW)[0].gap.work).toBe(false);
  });

  it('fills gaps early with chores due tomorrow, but not ones done today', () => {
    const gaps = gapsOn(NOW, [], SCHED, NOW);
    const tomorrow = chore({ id: 'tmrw', minutes: 10, everyDays: 3, lastDone: day(-2) });
    const doneToday = chore({ id: 'today', minutes: 10, everyDays: 1, lastDone: NOW - MIN });
    const later = chore({ id: 'later', minutes: 10, everyDays: 3, lastDone: day(-1) });
    expect(suggest(gaps, [tomorrow, doneToday, later], SCHED, NOW).flatMap((s) => s.chores.map((c) => c.id))).toEqual(['tmrw']);
  });

  it('reminds you about the washer after the meeting it finishes in', () => {
    const meetings = [busy('15:30', '16:00', 'Standup'), busy('16:00', '16:30', 'Sync')];
    const r = remindAt(at(NOW, '15:40'), meetings);
    expect(r.at).toBe(at(NOW, '16:30') + 2 * MIN);
    expect(r.during?.title).toBe('Standup');
    expect(remindAt(at(NOW, '15:10'), meetings).during).toBeNull();
  });
});

describe('notification plan', () => {
  const base = { chores: [], items: [], timers: [], busy: [], schedule: SCHED, digest: '08:00', gapNudges: true };

  it('schedules timers, gap nudges and a morning digest', () => {
    const p = plan(
      {
        ...base,
        chores: [chore({ name: 'Unload dishwasher', minutes: 10, everyDays: 1, lastDone: day(-1) })],
        items: [item({ onList: true })],
        timers: [{ id: 't', label: 'Washer', icon: 'water', startedAt: NOW, endsAt: at(NOW, '13:40') }],
        busy: [busy('12:30', '13:10', 'Lunch call'), busy('13:30', '14:00', 'Standup')],
      },
      NOW,
    );
    const timer = p.find((x) => x.id === 'timer:t');
    expect(timer?.at).toBe(at(NOW, '14:02'));
    expect(timer?.body).toContain('during Standup');
    const nudge = p.find((x) => x.id.startsWith('gap:'));
    expect(nudge?.title).toBe('20 min free before Standup at 1:30');
    expect(nudge?.body).toBe('Unload dishwasher (10 min)?');
    expect(p.filter((x) => x.id.startsWith('digest:')).length).toBe(2);
  });

  it('skips the digest when there is nothing to say', () => {
    expect(plan({ ...base, gapNudges: false }, NOW)).toEqual([]);
  });
});

describe('away reminders', () => {
  it('lists the groceries and errands when you leave home', () => {
    const t = awayText(
      { kind: 'left-home' },
      [item({ onList: true }), item({ id: 'i2', name: 'Rice', onList: true })],
      [chore({ name: 'Pick up laundry', where: 'out', everyDays: null, createdAt: day(-1) })],
      NOW,
    );
    expect(t?.title).toBe("You're out. 2 items on your list");
    expect(t?.body).toBe('Eggs and Rice\nErrands: Pick up laundry');
  });

  it('only shows items for that store (or any store) when you arrive', () => {
    const t = awayText(
      { kind: 'at-store', storeId: 'sm', name: 'SM' },
      [item({ onList: true, store: 'puregold' }), item({ id: 'i2', name: 'Rice', onList: true, store: 'sm' })],
      [],
      NOW,
    );
    expect(t?.body).toBe('Rice');
  });

  it('stays quiet with an empty list', () => {
    expect(awayText({ kind: 'left-home' }, [], [], NOW)).toBeNull();
  });
});
