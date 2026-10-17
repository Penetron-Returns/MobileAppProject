import * as Speech from 'expo-speech';
import * as React from 'react';

import { SpeakButton } from '@/components/SpeakButton';
import { act, mount, pressableByLabel } from '@/testing/render';

describe('SpeakButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the text aloud, then stops when pressed again', () => {
    const tree = mount(<SpeakButton text="What kind of business?" />);
    act(() => pressableByLabel(tree, 'Read aloud').props.onPress());
    expect(Speech.speak).toHaveBeenCalledWith(
      'What kind of business?',
      expect.objectContaining({ language: expect.any(String) }),
    );
    (Speech.stop as jest.Mock).mockClear();
    act(() => pressableByLabel(tree, 'Stop reading').props.onPress());
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('goes back to Read aloud when the speech finishes', () => {
    const tree = mount(<SpeakButton text="Hello" />);
    act(() => pressableByLabel(tree, 'Read aloud').props.onPress());
    const options = (Speech.speak as jest.Mock).mock.calls[0][1];
    act(() => options.onDone());
    expect(pressableByLabel(tree, 'Read aloud')).toBeDefined();
  });

  it('stops speaking when the screen goes away', () => {
    const tree = mount(<SpeakButton text="Hello" />);
    (Speech.stop as jest.Mock).mockClear();
    act(() => tree.unmount());
    expect(Speech.stop).toHaveBeenCalled();
  });
});
