import { whenFromPrefill } from '../prefill';

describe('whenFromPrefill', () => {
  it('starts the form on the long-pressed staff and day', () => {
    expect(
      whenFromPrefill({ staffId: 's1', date: '2026-10-14', time: '10:00' }),
    ).toEqual({
      staffId: 's1',
      date: '2026-10-14',
      picked: null,
      notes: '',
      sendWhatsApp: true,
    });
  });

  it.each([
    ['nothing', undefined],
    ['empty params', { staffId: '', date: '' }],
    ['a malformed date', { date: 'tomorrow' }],
  ])('falls back to the empty form for %s', (_name, input) => {
    expect(whenFromPrefill(input)).toMatchObject({
      staffId: null,
      date: null,
      picked: null,
    });
  });
});
