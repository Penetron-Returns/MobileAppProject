import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { initialDraft, selectType, toggleDay } from '../logic';
import {
  DoneStep,
  HoursStep,
  TypeStep,
  type StepActions,
} from '../components/OnboardingSteps';
import { TeamStep } from '../components/TeamStep';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const actions: StepActions = {
  selectType: jest.fn(),
  setName: jest.fn(),
  toggleDay: jest.fn(),
  toggleService: jest.fn(),
  setPrice: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
};

const text = (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return JSON.stringify(tree.toJSON());
};

const named = { ...initialDraft(), businessName: 'Ashgrove' };

describe('onboarding copy comes from the locale file', () => {
  it('lists the business types', () => {
    const json = text(<TypeStep draft={initialDraft()} actions={actions} />);
    expect(json).toContain('Barber shop');
    expect(json).toContain('Cuts, colour, braids and styling');
    expect(json).toContain('Business type');
  });

  it('labels hours rows, open ranges and closed days', () => {
    const json = text(<HoursStep draft={named} actions={actions} />);
    expect(json).toContain('Business name');
    expect(json).toContain('Monday to Friday');
    expect(json).toContain('08:30 to 17:30');
    expect(json).toContain('Closed');
    expect(json).toContain('Sunday open');
  });

  it('shows the owner row and the add-member control', () => {
    const json = text(
      <TeamStep draft={named} actions={actions} ownerName={null} />,
    );
    expect(json).toContain('You, the owner');
    expect(json).toContain('Add team member');
    expect(json).toContain('Role (optional)');
  });

  it('states the done summary with correct plurals', () => {
    const barber = selectType(named, 'barber');
    expect(text(<DoneStep draft={barber} />)).toContain(
      'Your barber shop is set up with 4 services.',
    );
    const open = toggleDay(barber, 'sunday');
    const json = text(<DoneStep draft={open} />);
    expect(json).toContain('Opening hours on 3 day groups');
    expect(json).toContain('You as the first team member');
  });
});
