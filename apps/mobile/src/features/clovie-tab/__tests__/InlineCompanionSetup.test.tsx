import { Text } from 'react-native';

import { mount, text } from '@/testing/render';

import { InlineCompanionSetup } from '../InlineCompanionSetup';

let mockSetup: unknown;
jest.mock('@/features/companion/sdk/inlineSetup', () => ({
  getCompanionSetup: () => mockSetup,
}));

describe('InlineCompanionSetup', () => {
  it('renders the moment as before when the SDK has no CompanionSetup', () => {
    mockSetup = undefined;
    const tree = mount(
      <InlineCompanionSetup>
        <Text>moment</Text>
      </InlineCompanionSetup>,
    );
    expect(text(tree)).toContain('moment');
  });

  it('wraps the moment in the SDK CompanionSetup when it exists', () => {
    mockSetup = ({ children }: { children: React.ReactNode }) => (
      <>
        <Text>setup</Text>
        {children}
      </>
    );
    const out = text(
      mount(
        <InlineCompanionSetup>
          <Text>moment</Text>
        </InlineCompanionSetup>,
      ),
    );
    expect(out).toContain('setup');
    expect(out).toContain('moment');
  });
});
