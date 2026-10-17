import type { AttendanceCheckDTO } from '@booking/types';

import { attendanceQueue, outcomeForAction, type QueueLabels } from '../queue';

const labels: QueueLabels = {
  question: (v) => `Did ${v.name} make it to their ${v.time}?`,
  came: 'Came',
  noShow: 'No-show',
  cameFor: (n) => `Mark ${n} as came`,
  noShowFor: (n) => `Mark ${n} as a no-show`,
};

function check(id: string, createdAt: string, name = 'Daniel') {
  return {
    id,
    created_at: createdAt,
    client_first_name: name,
    service_name: 'Cut',
    starts_at: '2026-10-17T07:00:00Z',
  } as AttendanceCheckDTO;
}

describe('attendanceQueue', () => {
  it('is empty for no checks', () => {
    expect(attendanceQueue([], 'Africa/Johannesburg', labels)).toEqual([]);
  });

  it('maps a check to a titled item with labelled actions', () => {
    const [item] = attendanceQueue(
      [check('a', '2026-10-17T08:00:00Z')],
      'Africa/Johannesburg',
      labels,
    );
    expect(item).toEqual({
      id: 'a',
      title: 'Did Daniel make it to their 09:00?',
      actions: [
        {
          id: 'came',
          label: 'Came',
          accessibilityLabel: 'Mark Daniel as came',
        },
        {
          id: 'no_show',
          label: 'No-show',
          accessibilityLabel: 'Mark Daniel as a no-show',
        },
      ],
    });
  });

  it('lists the oldest question first', () => {
    const items = attendanceQueue(
      [
        check('late', '2026-10-17T10:00:00Z'),
        check('early', '2026-10-17T08:00:00Z'),
      ],
      'UTC',
      labels,
    );
    expect(items.map((i) => i.id)).toEqual(['early', 'late']);
  });
});

describe('outcomeForAction', () => {
  it('maps the issued action ids and rejects others', () => {
    expect(outcomeForAction('came')).toBe('came');
    expect(outcomeForAction('no_show')).toBe('no_show');
    expect(outcomeForAction('nope')).toBeNull();
  });
});
