import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: () => View,
    },
  );
});

import { SafeAreaProvider } from 'react-native-safe-area-context';

import BookingDetailsScreen from '../bookings/[id]';
import ClientDetailsScreen from '../clients/[id]';
import DashboardScreen from '../index';
import BusinessDetailsScreen from '../settings/business-details';
import OperatingHoursScreen from '../settings/operating-hours';
import ServicesScreen from '../settings/services';
import StaffManagementScreen from '../settings/staff-management';

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function renderScreen(ui: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>,
    );
  });
  return tree;
}

describe('App screens', () => {
  it('renders DashboardScreen with stats and schedule', () => {
    const tree = renderScreen(<DashboardScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Administrator');
    expect(json).toContain('Monthly Revenue');
    expect(json).toContain("Today's Schedule");
    expect(json).toContain('Sarah Jenkins');
  });

  it('renders BookingDetailsScreen with Coming soon', () => {
    const tree = renderScreen(<BookingDetailsScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Booking details');
  });

  it('renders ClientDetailsScreen with Coming soon', () => {
    const tree = renderScreen(<ClientDetailsScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Client details');
  });

  it('renders OperatingHoursScreen with Coming soon', () => {
    const tree = renderScreen(<OperatingHoursScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Operating hours');
  });

  it('renders ServicesScreen with Coming soon', () => {
    const tree = renderScreen(<ServicesScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Services');
  });

  it('renders BusinessDetailsScreen with Coming soon', () => {
    const tree = renderScreen(<BusinessDetailsScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Business details');
  });

  it('renders StaffManagementScreen with Coming soon', () => {
    const tree = renderScreen(<StaffManagementScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain('Coming soon');
    expect(JSON.stringify(tree.toJSON())).toContain('Staff management');
  });
});
