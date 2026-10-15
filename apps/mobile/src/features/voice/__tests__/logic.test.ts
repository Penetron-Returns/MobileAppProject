import { parseVoiceCommand } from '../logic';

describe('parseVoiceCommand', () => {
  it.each([
    'client has arrived',
    'Client has arrived',
    'CLIENT HAS ARRIVED.',
    "client's here",
    'Client’s here!',
    'my client is here',
    'My client is here.',
    'the client has just arrived',
    'um, my client is here please',
    'uh client has arrived',
    'Hey Clovie, client has arrived',
    'hey clovie my client just walked in',
    'okay clovie, client is here',
    'the next client is waiting',
    'customer has arrived',
    'is here',
  ])('treats "%s" as an arrival with no name', (text) => {
    expect(parseVoiceCommand(text)).toEqual({ kind: 'client_arrived' });
  });

  it.each([
    ['Thandi is here', 'Thandi'],
    ['thandi has arrived', 'Thandi'],
    ["Thandi's here", 'Thandi'],
    ['Thandi Mokoena has arrived', 'Thandi Mokoena'],
    ['my client Thandi is here', 'Thandi'],
    ['Hey Clovie, Sipho just arrived.', 'Sipho'],
    ["uh, Naledi's in", 'Naledi'],
    ['Zoë has arrived', 'Zoe'],
  ])('captures the name in "%s"', (text, name) => {
    expect(parseVoiceCommand(text)).toEqual({ kind: 'client_arrived', name });
  });

  it.each([
    'what is here',
    'who is here',
    'where is the next client',
    'move my three o clock to four',
    'how many bookings do I have today',
    'the client is happy with the arrival time',
    'there are five clients here today and one more is waiting for a while',
  ])('hands "%s" to the companion', (text) => {
    expect(parseVoiceCommand(text)).toEqual({ kind: 'request', text });
  });

  it('keeps the original wording of a request, trimmed', () => {
    expect(parseVoiceCommand('  Book Thandi for Friday at 10  ')).toEqual({
      kind: 'request',
      text: 'Book Thandi for Friday at 10',
    });
  });

  it('turns an empty transcript into an empty request', () => {
    expect(parseVoiceCommand('')).toEqual({ kind: 'request', text: '' });
    expect(parseVoiceCommand('   ')).toEqual({ kind: 'request', text: '' });
  });

  it('caps a very long transcript', () => {
    const result = parseVoiceCommand('a'.repeat(900));
    expect(result).toEqual({ kind: 'request', text: 'a'.repeat(500) });
  });
});
