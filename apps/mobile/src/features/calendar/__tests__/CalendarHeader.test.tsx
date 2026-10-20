import { DAY_CIRCLE } from '../components/CalendarHeader';

describe('DayStrip circle', () => {
  it('is a circle: radius is half the side', () => {
    expect(DAY_CIRCLE.borderRadius).toBe(DAY_CIRCLE.width / 2);
    expect(DAY_CIRCLE.width).toBe(DAY_CIRCLE.height);
  });
});

describe('DayStrip cell', () => {
  it('centres its label in the circle box', () => {
    expect(DAY_CIRCLE.alignItems).toBe('center');
    expect(DAY_CIRCLE.justifyContent).toBe('center');
  });
});
