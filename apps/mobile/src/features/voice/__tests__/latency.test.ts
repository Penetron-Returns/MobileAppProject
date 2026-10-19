import { shapeVoiceLatency } from '../latency';

describe('shapeVoiceLatency', () => {
  const cases: [
    string,
    Parameters<typeof shapeVoiceLatency>[0],
    ReturnType<typeof shapeVoiceLatency>,
  ][] = [
    ['nothing', undefined, null],
    ['an empty report', {}, null],
    ['only labels', { endpoint: 'partial', sttPath: 'device' }, null],
    [
      'a full device turn',
      {
        sttPath: 'device',
        endpoint: 'partial',
        finalTranscriptMs: 12,
        requestSentMs: 140,
        firstReplyByteMs: 1_050,
        interimStartMs: 380,
        ttsStartMs: 1_450,
      },
      {
        stt_path: 'device',
        endpoint: 'partial',
        final_transcript_ms: 12,
        request_sent_ms: 140,
        first_reply_byte_ms: 1_050,
        interim_start_ms: 380,
        tts_start_ms: 1_450,
      },
    ],
    [
      'a turn with no spoken reply keeps the steps that happened',
      { sttPath: 'cloud', endpoint: 'clip', finalTranscriptMs: 900 },
      { stt_path: 'cloud', endpoint: 'clip', final_transcript_ms: 900 },
    ],
    [
      'rounds to whole milliseconds',
      { ttsStartMs: 99.6 },
      { tts_start_ms: 100 },
    ],
    [
      'drops negative, non-finite and absurd durations',
      {
        finalTranscriptMs: -1,
        requestSentMs: Number.NaN,
        firstReplyByteMs: 9_999_999,
        ttsStartMs: 800,
      },
      { tts_start_ms: 800 },
    ],
    [
      'drops unknown labels',
      {
        sttPath: 'Thandi',
        endpoint: 'a@b.co',
        ttsStartMs: 5,
      } as unknown as Parameters<typeof shapeVoiceLatency>[0],
      { tts_start_ms: 5 },
    ],
  ];

  it.each(cases)('shapes %s', (_name, raw, expected) => {
    expect(shapeVoiceLatency(raw)).toEqual(expected);
  });
});
