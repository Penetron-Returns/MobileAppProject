import type { FeatureKey } from '@shared/api';
import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { Gate } from '../components/Gate';
import type { Entitlements } from '../hooks';

jest.mock('../hooks', () => ({ useEntitlements: jest.fn() }));

const mockUseEntitlements = (
  require('../hooks') as { useEntitlements: jest.Mock }
).useEntitlements;

function entitlements(
  over: Partial<Entitlements> & { granted?: FeatureKey[] } = {},
): Entitlements {
  const granted = over.granted ?? [];
  return {
    plan: 'free',
    has: (f) => granted.includes(f),
    limitOf: () => null,
    isLoading: false,
    isError: false,
    ...over,
  };
}

function render(node: React.ReactElement): string {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(node);
  });
  return JSON.stringify(tree.toJSON());
}

describe('<Gate>', () => {
  it('renders children when the plan has the feature', () => {
    mockUseEntitlements.mockReturnValue(entitlements({ granted: ['inbox'] }));
    expect(render(<Gate feature="inbox">{'visible'}</Gate>)).toContain(
      'visible',
    );
  });

  it('renders the fallback (or nothing) when it does not', () => {
    mockUseEntitlements.mockReturnValue(
      entitlements({ plan: 'growth', granted: ['companion'] }),
    );
    expect(
      render(
        <Gate feature="inbox" fallback="upsell">
          {'secret'}
        </Gate>,
      ),
    ).toBe('"upsell"');
    expect(render(<Gate feature="inbox">{'secret'}</Gate>)).toBe('null');
  });

  it('never flashes gated content while loading', () => {
    mockUseEntitlements.mockReturnValue(
      entitlements({ isLoading: true, plan: null }),
    );
    expect(
      render(
        <Gate feature="inbox" loading="spinner">
          {'secret'}
        </Gate>,
      ),
    ).toBe('"spinner"');
    expect(render(<Gate feature="inbox">{'secret'}</Gate>)).toBe('null');
  });

  it('fails closed when entitlements failed to load', () => {
    mockUseEntitlements.mockReturnValue(
      entitlements({ isError: true, plan: null }),
    );
    expect(
      render(
        <Gate feature="inbox" fallback="nope">
          {'secret'}
        </Gate>,
      ),
    ).toBe('"nope"');
  });
});
