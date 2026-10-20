import type { ComponentType } from 'react';

import {
  BufferScene,
  CancelScene,
  HorizonScene,
  IntervalScene,
  LeadScene,
  StaffScene,
} from './bookingRules';
import {
  HolidayScene,
  PushScene,
  RemindScene,
  WeekScene,
} from './hoursAndNotifications';
import type { SceneProps } from './parts';

/** One micro-scene per settings row (the ids are the canvas's own). */
export const SCENES = {
  lead: LeadScene,
  horizon: HorizonScene,
  cancel: CancelScene,
  interval: IntervalScene,
  buffer: BufferScene,
  staff: StaffScene,
  week: WeekScene,
  holiday: HolidayScene,
  push: PushScene,
  remind: RemindScene,
} satisfies Record<string, ComponentType<SceneProps>>;

export type SceneId = keyof typeof SCENES;
