import * as React from 'react';

import { mount, text } from '@/testing/render';

import CompanionRoute from '../companion';
import ConversationRoute from '../inbox/[id]';
import ReportsRoute from '../reports';
import InboxRoute from '../(tabs)/inbox';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  useLocalSearchParams: () => ({ id: 'c1' }),
}));

let mockGranted: string[] = [];
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => ({
    isLoading: false,
    has: (f: string) => mockGranted.includes(f),
  }),
}));

jest.mock('@/features/inbox/components/InboxScreen', () => ({
  InboxScreen: () => 'INBOX_SCREEN',
}));
jest.mock('@/features/inbox/components/ConversationScreen', () => ({
  ConversationScreen: () => 'CONVERSATION_SCREEN',
}));
jest.mock('@/features/companion/components/CompanionScreen', () => ({
  CompanionScreen: () => 'COMPANION_SCREEN',
}));
jest.mock('@/features/reports/components/ReportsScreen', () => ({
  ReportsScreen: () => 'REPORTS_SCREEN',
}));

const FREE = ['inbox', 'whatsapp_menu'];
const PAID = ['companion', 'reports'];

beforeEach(() => mockRedirect.mockClear());

describe('plan gating of routes', () => {
  it('Free sees the Inbox and conversations, and is sent home from Reports and the Companion', () => {
    mockGranted = FREE;
    expect(text(mount(<InboxRoute />))).toContain('INBOX_SCREEN');
    expect(text(mount(<ConversationRoute />))).toContain('CONVERSATION_SCREEN');
    expect(mockRedirect).not.toHaveBeenCalled();

    expect(text(mount(<ReportsRoute />))).not.toContain('REPORTS_SCREEN');
    expect(text(mount(<CompanionRoute />))).not.toContain('COMPANION_SCREEN');
    expect(mockRedirect).toHaveBeenCalledTimes(2);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('paid plans see Reports and the Companion, and are sent home from the Inbox', () => {
    mockGranted = PAID;
    expect(text(mount(<ReportsRoute />))).toContain('REPORTS_SCREEN');
    expect(text(mount(<CompanionRoute />))).toContain('COMPANION_SCREEN');
    expect(mockRedirect).not.toHaveBeenCalled();

    expect(text(mount(<InboxRoute />))).not.toContain('INBOX_SCREEN');
    expect(text(mount(<ConversationRoute />))).not.toContain(
      'CONVERSATION_SCREEN',
    );
    expect(mockRedirect).toHaveBeenCalledTimes(2);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
