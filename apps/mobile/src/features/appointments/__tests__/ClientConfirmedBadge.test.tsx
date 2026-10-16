import * as React from 'react';

import { mount, text } from '@/testing/render';

import { ClientConfirmedBadge } from '../components/ClientConfirmedBadge';

describe('ClientConfirmedBadge', () => {
  it('renders nothing until the client has confirmed', () => {
    for (const variant of ['pill', 'glyph'] as const) {
      const tree = mount(
        <ClientConfirmedBadge confirmedAt={null} variant={variant} />,
      );
      expect(text(tree)).toBe('');
      expect(
        tree.root.findAll(
          (n) => n.props.accessibilityLabel === 'Confirmed by client',
        ),
      ).toHaveLength(0);
    }
  });

  it('shows the label in the pill variant', () => {
    const out = text(
      mount(<ClientConfirmedBadge confirmedAt="2026-10-16T08:00:00Z" />),
    );
    expect(out).toContain('Confirmed by client');
  });

  it('is a labelled glyph without visible text in dense rows', () => {
    const tree = mount(
      <ClientConfirmedBadge
        confirmedAt="2026-10-16T08:00:00Z"
        variant="glyph"
      />,
    );
    expect(text(tree)).not.toContain('Confirmed by client');
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Confirmed by client',
      ).length,
    ).toBeGreaterThan(0);
  });
});
