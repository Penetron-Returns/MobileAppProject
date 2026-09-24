import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/ui/text';
import type { AppointmentStatus } from '@shared/api';

function labelOf(status: AppointmentStatus) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StatusBadge status={status} />);
  });
  return tree.root.findByType(Text as never).props.children as string;
}

describe('StatusBadge', () => {
  it('renders the confirmed label', () => {
    expect(labelOf('confirmed')).toBe('Confirmed');
  });

  it('renders the cancelled label', () => {
    expect(labelOf('cancelled')).toBe('Cancelled');
  });

  it('renders the completed label', () => {
    expect(labelOf('completed')).toBe('Completed');
  });

  it('renders the no_show label', () => {
    expect(labelOf('no_show')).toBe('No-show');
  });

  it('adds a leading dot in pill mode', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<StatusBadge status="confirmed" pill />);
    });
    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain('rounded-full');
  });
});
