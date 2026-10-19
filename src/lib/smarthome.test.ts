import { describe, expect, it } from 'vitest';
import { Chore } from './chores';
import { Busy, Schedule } from './gaps';
import { plan, timerText } from './reminders';
import { HomeEvent, HomeState, Trigger, applyEvents, haAutomation, keyFrom, verb } from './smarthome';
import { DAY, HOUR, MIN } from './time';

// Thursday 15 Oct 2026, 1:00 PM local.
const NOW = new Date(2026, 9, 15, 13, 0).getTime();

const trash: Chore = { id: 'c1', name: 'Take out the trash', room: 'Kitchen', everyDays: 2, minutes: 5, where: 'home', lastDone: NOW - 3 * DAY, createdAt: NOW - 30 * DAY, snoozedUntil: null };
const fix: Chore = { ...trash, id: 'c2', name: 'Fix the faucet', everyDays: null, lastDone: null };

const button: Trigger = { id: 't1', key: 'trash', name: 'Trash button', icon: 'x', kind: 'chore', choreId: 'c1', minutes: 45, reportsFinish: false, createdAt: 0 };
const washer: Trigger = { id: 't2', key: 'washer', name: 'Washer', icon: 'water-outline', kind: 'appliance', choreId: null, minutes: 45, reportsFinish: false, createdAt: 0 };

const state = (extra: Partial<HomeState> = {}): HomeState => ({ chores: [trash, fix], history: [], timers: [], triggers: [button, washer], ...extra });
let n = 0;
const ev = (key: string, event: string, at = NOW): HomeEvent => ({ id: ++n, key, event, at });
const apply = (s: HomeState, events: HomeEvent[], now = NOW) => applyEvents(s, events, now, 1000);

const SCHEDULE: Schedule = { workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00', dayStart: '07:00', dayEnd: '22:00', maxWorkChore: 15, buffer: 5 };

describe('smart home', () => {
  it('reads common event words', () => {
    expect(verb(button, 'pressed')).toBe('done');
    expect(verb(button, '')).toBe('done');
    expect(verb(button, 'started')).toBeNull();
    expect(verb(washer, 'ON')).toBe('started');
    expect(verb(washer, ' finished ')).toBe('finished');
    expect(verb(washer, 'double')).toBeNull();
  });

  it('makes trigger names hubs can send', () => {
    expect(keyFrom('Take out the trash!')).toBe('take-out-the-trash');
    expect(keyFrom('Lababo ñ')).toBe('lababo-n');
    expect(keyFrom('x'.repeat(80))).toHaveLength(48);
  });

  it('marks the chore done when the button is pressed, like ticking it', () => {
    const r = apply(state(), [ev('trash', 'pressed', NOW - 5 * MIN)]);
    expect(r.chores.find((c) => c.id === 'c1')!.lastDone).toBe(NOW - 5 * MIN);
    expect(r.history).toEqual([{ choreId: 'c1', at: NOW - 5 * MIN, late: 1 }]);
    expect(r.log).toEqual(['Take out the trash done']);
  });

  it('counts a double press, or the same event pulled twice, once', () => {
    const once = apply(state(), [ev('trash', 'pressed'), ev('TRASH', 'pressed', NOW + 2 * MIN)]);
    expect(once.history).toHaveLength(1);
    const again = apply(once, [ev('trash', 'pressed')]);
    expect(again.history).toHaveLength(1);
    expect(again.log).toEqual([]);
    // A press much later is a new time.
    expect(apply(once, [ev('trash', 'pressed', NOW + 2 * HOUR)]).history).toHaveLength(2);
  });

  it('finishes one-off chores for good', () => {
    const t: Trigger = { ...button, id: 't3', key: 'faucet', choreId: 'c2' };
    const r = apply(state({ triggers: [t] }), [ev('faucet', 'done')]);
    expect(r.chores.map((c) => c.id)).toEqual(['c1']);
    // Pressing again does nothing: the chore is gone.
    expect(apply(r, [ev('faucet', 'done', NOW + HOUR)]).history).toHaveLength(1);
  });

  it('ignores unknown triggers and events', () => {
    const s = state();
    const r = apply(s, [ev('doorbell', 'pressed'), ev('washer', 'double'), ev('trash', 'started')]);
    expect(r.chores).toBe(s.chores);
    expect(r.timers).toBe(s.timers);
    expect(r.log).toEqual([]);
  });

  it('runs the washer timer from start to finish and learns how long it takes', () => {
    const started = apply(state(), [ev('washer', 'started', NOW - 10 * MIN)]);
    expect(started.timers).toEqual([{ id: 'hook:t2', label: 'Washer', icon: 'water-outline', startedAt: NOW - 10 * MIN, endsAt: NOW + 35 * MIN }]);

    const later = NOW + 50 * MIN;
    const done = apply(started, [ev('washer', 'finished', later - MIN)], later);
    const [t] = done.timers;
    expect(t).toMatchObject({ id: 'hook:t2', startedAt: NOW - 10 * MIN, endsAt: later - MIN, finishedAt: later - MIN, remindFrom: later + 2_000 });
    // Ran 59 minutes; the estimate moves a third of the way there.
    expect(done.triggers.find((x) => x.id === 't2')).toMatchObject({ minutes: 50, reportsFinish: true });
    expect(done.log).toEqual(['Washer finished']);

    // Applying the finish again changes nothing.
    const again = apply(done, [ev('washer', 'finished', later - MIN)], later + MIN);
    expect(again.timers).toEqual(done.timers);
    expect(again.log).toEqual([]);
  });

  it('reminds right away when you are free, after the meeting when you are not', () => {
    const done = apply(state(), [ev('washer', 'finished')]);
    const [t] = done.timers;
    expect(t).toMatchObject({ startedAt: NOW, endsAt: NOW, finishedAt: NOW });

    const free = plan({ chores: [], items: [], timers: done.timers, busy: [], schedule: SCHEDULE, digest: null, gapNudges: false }, NOW);
    expect(free).toEqual([expect.objectContaining({ id: 'timer:hook:t2', title: 'Washer is done', at: NOW + 2_000 })]);

    const meeting: Busy = { start: NOW - 30 * MIN, end: NOW + 30 * MIN, title: 'Sprint review' };
    const r = timerText(t, [meeting]);
    expect(r.at).toBeGreaterThanOrEqual(NOW + 30 * MIN);
    expect(r.at).toBeLessThan(NOW + 35 * MIN);
    expect(r.body).toMatch(/during Sprint review/);
  });

  it("doesn't remind about a finish heard about hours later", () => {
    const done = apply(state(), [ev('washer', 'finished', NOW - 8 * HOUR)]);
    expect(done.timers[0].remindFrom).toBeUndefined();
    expect(plan({ chores: [], items: [], timers: done.timers, busy: [], schedule: SCHEDULE, digest: null, gapNudges: false }, NOW)).toEqual([]);
  });

  it('ends a timer started by hand with the same name', () => {
    const manual = { id: 'm1', label: 'washer', icon: 'water-outline', startedAt: NOW - 40 * MIN, endsAt: NOW + 5 * MIN };
    const r = apply(state({ timers: [manual] }), [ev('washer', 'finished')]);
    expect(r.timers).toEqual([expect.objectContaining({ id: 'm1', endsAt: NOW, finishedAt: NOW })]);
  });

  it('waits for the plug instead of the estimate once it has reported a finish', () => {
    const s = state({ triggers: [button, { ...washer, reportsFinish: true }] });
    const r = apply(s, [ev('washer', 'on')]);
    expect(r.timers[0].waitForFinish).toBe(true);
    expect(plan({ chores: [], items: [], timers: r.timers, busy: [], schedule: SCHEDULE, digest: null, gapNudges: false }, NOW)).toEqual([]);
  });

  it('skips a start that would already be over', () => {
    expect(apply(state(), [ev('washer', 'started', NOW - 2 * HOUR)]).timers).toEqual([]);
  });

  it("doesn't learn from glitches", () => {
    const started = apply(state(), [ev('washer', 'started', NOW)]);
    const blip = apply(started, [ev('washer', 'finished', NOW + MIN)], NOW + MIN);
    expect(blip.triggers.find((x) => x.id === 't2')!.minutes).toBe(45);
  });

  it('writes Home Assistant automations for each kind', () => {
    expect(haAutomation(washer)).toMatch(/sensor\.washer_power[\s\S]*trigger: washer\n\s+event: finished/);
    expect(haAutomation({ ...button, key: 'take-out-trash' })).toMatch(/event\.take_out_trash_button[\s\S]*trigger: take-out-trash\n\s+event: pressed/);
  });
});
