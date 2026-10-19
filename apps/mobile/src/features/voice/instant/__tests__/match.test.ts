import { matchInstantIntent, normalizeUtterance } from '../match';
import type { InstantIntent } from '../types';

const NEXT: InstantIntent = { kind: 'next' };
const COUNT: InstantIntent = { kind: 'count' };

describe('normalizeUtterance', () => {
  it.each([
    ["Hey Clovie, who's next?", 'who is next'],
    ['Okay, please tell me how busy am I today.', 'how busy am i today'],
    ['Am I free at 3:30 P.M.?', 'am i free at 3:30 p m'],
    ['who is next please', 'who is next'],
  ])('%s', (raw, expected) => {
    expect(normalizeUtterance(raw)).toBe(expected);
  });
});

describe('matchInstantIntent positives', () => {
  it.each<[string, InstantIntent]>([
    ["who's next", NEXT],
    ['Who is my next client?', NEXT],
    ['hey clovie who is my next client', NEXT],
    ['next appointment', NEXT],
    ["what's my next appointment", NEXT],
    ['when is my next booking', NEXT],
    ['who do I have next', NEXT],
    ['how many bookings do I have today', COUNT],
    ['how many appointments today', COUNT],
    ['how many clients do I have left today', COUNT],
    ['how busy am I today', COUNT],
    ['how busy am I', COUNT],
    ['how does my day look', COUNT],
    ["what's my first appointment today", { kind: 'edge', which: 'first' }],
    ['when do I start today', { kind: 'edge', which: 'first' }],
    ['who is my last client', { kind: 'edge', which: 'last' }],
    ['what time is my last booking', { kind: 'edge', which: 'last' }],
    ['when do I finish today', { kind: 'edge', which: 'last' }],
    [
      'am I free at 3',
      { kind: 'free_at', time: { kind: 'clock', hour: 3, minute: 0 } },
    ],
    [
      'Am I free at 3 PM?',
      {
        kind: 'free_at',
        time: { kind: 'clock', hour: 3, minute: 0, meridiem: 'pm' },
      },
    ],
    [
      'do I have anything at 15:30',
      { kind: 'free_at', time: { kind: 'clock', hour: 15, minute: 30 } },
    ],
    [
      'is 2pm open',
      {
        kind: 'free_at',
        time: { kind: 'clock', hour: 2, minute: 0, meridiem: 'pm' },
      },
    ],
    [
      'am I busy at half past three',
      { kind: 'free_at', time: { kind: 'clock', hour: 3, minute: 30 } },
    ],
    ['am I free now', { kind: 'free_at', time: { kind: 'now' } }],
    [
      'is Emma free at 4',
      {
        kind: 'free_at',
        time: { kind: 'clock', hour: 4, minute: 0 },
        staff: 'emma',
      },
    ],
    [
      'is Emma free at quarter to four',
      {
        kind: 'free_at',
        time: { kind: 'clock', hour: 4, minute: -15 },
        staff: 'emma',
      },
    ],
    ['when is Jake coming', { kind: 'client_time', name: 'jake' }],
    ['what time is Jake', { kind: 'client_time', name: 'jake' }],
    ["when is Jake's appointment", { kind: 'client_time', name: 'jake' }],
    [
      'what time is Olivia Brown coming in today',
      { kind: 'client_time', name: 'olivia brown' },
    ],
  ])('%s', (text, expected) => {
    expect(matchInstantIntent(text)).toEqual(expected);
  });
});

describe('matchInstantIntent falls through', () => {
  it.each([
    '',
    'hello',
    'what time is it',
    "who's next and move them to four",
    'cancel my next appointment',
    'book Jake at 3',
    'reschedule Olivia to 5pm',
    'tell Jake I am running late',
    'add a booking for three',
    'how much have I made this week',
    'who was my last client yesterday',
    'am I free tomorrow at 3',
    'am I free this afternoon',
    'is the shop open at 3',
    'do I have anything today',
    'when is lunch',
    'when is my next day off',
    'client has arrived',
    'what is the weather like today and who is next and how busy am I and what else is going on',
  ])('%j', (text) => {
    expect(matchInstantIntent(text)).toBeNull();
  });

  it('rejects a time it cannot read rather than guessing', () => {
    expect(matchInstantIntent('am I free at around lunchtime')).toBeNull();
    expect(matchInstantIntent('am I free at 25')).toBeNull();
    expect(matchInstantIntent('am I free at 3:75')).toBeNull();
  });

  it('rejects a staff name that is really a generic word', () => {
    expect(matchInstantIntent('is anyone free at 3')).toBeNull();
    expect(matchInstantIntent('is there free at 3')).toBeNull();
  });
});
