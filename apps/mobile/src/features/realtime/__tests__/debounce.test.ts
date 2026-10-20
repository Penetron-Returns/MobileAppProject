import { createKeyedDebouncer } from '../debounce';

describe('createKeyedDebouncer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs a burst for one key once, after the last event', () => {
    const run = jest.fn();
    const d = createKeyedDebouncer<string>(run, 300);
    d.schedule('a');
    jest.advanceTimersByTime(200);
    d.schedule('a');
    jest.advanceTimersByTime(299);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('a');
  });

  it('debounces keys independently and can be cancelled', () => {
    const run = jest.fn();
    const d = createKeyedDebouncer<string>(run, 300);
    d.schedule('a');
    d.schedule('b');
    d.cancelAll();
    jest.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    d.schedule('a');
    d.schedule('b');
    jest.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
