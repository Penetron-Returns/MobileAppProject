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

import AddBookingScreen from '../add';
import BookingDetailsScreen from '../bookings/[id]';
import CalendarScreen from '../calendar';
import ClientsScreen from '../clients';
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

  it('renders CalendarScreen with daily timeline and bookings', () => {
    const tree = renderScreen(<CalendarScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Administrator');
    expect(json).toContain('Haircut & Styling');
    expect(json).toContain('Full Color & Blowout');
    expect(json).toContain('Lunch Break');
    expect(json).toContain('Day');
  });

  it('renders CalendarScreen and toggles to week view', () => {
    const tree = renderScreen(<CalendarScreen />);
    const weekButton = tree.root.findByProps({
      accessibilityLabel: 'Week view',
    });
    act(() => {
      weekButton.props.onPress();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('October 23 – 29, 2023');
    expect(json).toContain('Time');
    expect(json).toContain('Mon');
    expect(json).toContain('Tue');
    expect(json).toContain('Balayage & Styling');
  });

  it('renders CalendarScreen and toggles to month view, clicking a date switches to day view', () => {
    const tree = renderScreen(<CalendarScreen />);
    const monthButton = tree.root.findByProps({
      accessibilityLabel: 'Month view',
    });
    act(() => {
      monthButton.props.onPress();
    });
    let json = JSON.stringify(tree.toJSON());
    expect(json).toContain('October 2023');
    expect(json).toContain('MONTH VIEW');

    // Click on a day in Month view
    const oct24Button = tree.root.findByProps({
      accessibilityLabel: 'October 24, 2023, 3 appointments',
    });
    act(() => {
      oct24Button.props.onPress();
    });

    json = JSON.stringify(tree.toJSON());
    expect(json).toContain('October 24, 2023');
    expect(json).toContain('Tuesday');
    expect(json).toContain('Haircut & Styling');
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

  it('renders AddBookingScreen with client toggle and fields', () => {
    const tree = renderScreen(<AddBookingScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Administrator');
    expect(json).toContain('Client');
    expect(json).toContain('Existing');
    expect(json).toContain('New Client');
    expect(json).toContain('Service');
    expect(json).toContain('Signature Facial');
    expect(json).toContain('Send WhatsApp confirmation');
    expect(json).toContain('Save Booking');
  });

  it('renders ClientsScreen with search, filters and clients list', () => {
    const tree = renderScreen(<ClientsScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Administrator');
    expect(json).toContain('Clients');
    expect(json).toContain('Manage your client relationships');
    expect(json).toContain('Search clients by name or phone...');
    expect(json).toContain('All Clients');
    expect(json).toContain('Recent');
    expect(json).toContain('VIP');
    expect(json).toContain('Sarah Jenkins');
    expect(json).toContain('Michael Rodriguez');
    expect(json).toContain('David Chen');
    expect(json).toContain('Appointment Today at 2:00 PM');
    expect(json).toContain('Emma Lawson');
    expect(json).toContain('Load more clients');
  });

  it('toggles VIP filter on ClientsScreen', () => {
    const tree = renderScreen(<ClientsScreen />);
    // Find VIP button
    const vipButton = tree.root.findAll((node) => {
      return (
        node.props?.accessibilityRole === 'tab' &&
        node.props?.children?.props?.children === 'VIP'
      );
    })[0];
    act(() => {
      vipButton.props.onPress();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Sarah Jenkins');
    expect(json).toContain('David Chen');
    expect(json).not.toContain('Michael Rodriguez');
  });

  it('loads more clients when tapping Load more clients', () => {
    const tree = renderScreen(<ClientsScreen />);
    const loadMoreBtn = tree.root.findByProps({
      accessibilityLabel: 'Load more clients',
    });
    act(() => {
      loadMoreBtn.props.onPress();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Jessica Taylor');
    expect(json).toContain('Robert Johnson');
  });
});
