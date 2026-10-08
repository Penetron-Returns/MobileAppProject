import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Admin User',
      primaryEmailAddress: { emailAddress: 'admin@beautywellness.co' },
      imageUrl: null,
    },
  }),
  useOrganization: () => ({
    organization: { name: 'Beauty & Wellness' },
  }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: () => View,
    },
  );
});

jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

import { SafeAreaProvider } from 'react-native-safe-area-context';

import AddBookingScreen from '../add';
import BookingDetailsScreen from '../bookings/[id]';
import CalendarScreen from '../calendar';
import ClientsScreen from '../clients';
import ClientDetailsScreen from '../clients/[id]';
import DashboardScreen from '../index';
import SettingsScreen from '../settings';
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

  it('renders BookingDetailsScreen with client, schedule, service and actions', () => {
    const tree = renderScreen(<BookingDetailsScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Booking Detail');
    expect(json).toContain('Confirmed');
    expect(json).toContain('Nadia Osman');
    expect(json).toContain('Full Balayage & Toner');
    expect(json).toContain('Amara S.');
    expect(json).toContain('Message');
    expect(json).toContain('Reschedule');
    expect(json).toContain('Cancel');
  });

  it('renders ClientDetailsScreen with profile, contact, notes, and history', () => {
    const tree = renderScreen(<ClientDetailsScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Client Profile');
    expect(json).toContain('Nadia Osman');
    expect(json).toContain('Message');
    expect(json).toContain('Call');
    expect(json).toContain('Book');
    expect(json).toContain('Contact Details');
    expect(json).toContain('Important Notes');
    expect(json).toContain('Total Visits');
    expect(json).toContain('Booking History');
    expect(json).toContain('Balayage & Styling');
  });

  it('renders OperatingHoursScreen with weekly schedule and actions', () => {
    const tree = renderScreen(<OperatingHoursScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Operating Hours');
    expect(json).toContain('Set your salon');
    expect(json).toContain('standard availability');
    expect(json).toContain('Monday');
    expect(json).toContain('Sunday');
    expect(json).toContain('Open');
    expect(json).toContain('Closed');
    expect(json).toContain('09:00 AM');
    expect(json).toContain('06:00 PM');
    expect(json).toContain('Cancel');
    expect(json).toContain('Save Changes');
  });

  it('renders ServicesScreen with service catalogue and categories', () => {
    const tree = renderScreen(<ServicesScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Services');
    expect(json).toContain('Hair');
    expect(json).toContain("Women's Haircut");
    expect(json).toContain("Men's Haircut");
    expect(json).toContain('Balayage & Toner');
    expect(json).toContain('Nails');
    expect(json).toContain('Gel Manicure');
    expect(json).toContain('Spa Pedicure');
    expect(json).toContain('Add Service');
  });

  it('renders BusinessDetailsScreen with business info, location, and regional settings', () => {
    const tree = renderScreen(<BusinessDetailsScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Business Details');
    expect(json).toContain('Business Information');
    expect(json).toContain('Luxe Beauty Lounge');
    expect(json).toContain('hello@luxebeauty.com');
    expect(json).toContain('Location Details');
    expect(json).toContain('45 Main Road, Sea Point');
    expect(json).toContain('Cape Town');
    expect(json).toContain('8005');
    expect(json).toContain('Regional Settings');
    expect(json).toContain('South African Rand (ZAR)');
    expect(json).toContain('Save Changes');
  });

  it('renders StaffManagementScreen with team directory and staff cards', () => {
    const tree = renderScreen(<StaffManagementScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Staff Management');
    expect(json).toContain('Team Directory');
    expect(json).toContain('Manage roles and availability');
    expect(json).toContain('Add Staff');
    expect(json).toContain('Emma Thompson');
    expect(json).toContain('Senior Colorist');
    expect(json).toContain('Marcus Chen');
    expect(json).toContain('Master Stylist');
    expect(json).toContain('Sarah Jenkins');
    expect(json).toContain('Junior Stylist');
    expect(json).toContain('Active');
    expect(json).toContain('On Leave');
    expect(json).toContain('Bookings');
    expect(json).toContain('Save Changes');
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

  it('renders SettingsScreen with Administrator header, preferences, and business settings', () => {
    const tree = renderScreen(<SettingsScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Administrator');
    expect(json).toContain('Settings');
    expect(json).toContain('Preferences');
    expect(json).toContain('Dark Mode');
    expect(json).toContain('Push Notifications');
    expect(json).toContain('Business Settings');
    expect(json).toContain('Business Details');
    expect(json).toContain('Operating Hours');
    expect(json).toContain('Services');
    expect(json).toContain('Staff Management');
    expect(json).toContain('WhatsApp API');
    expect(json).toContain('Log Out');
  });
});
