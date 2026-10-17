import type { Story } from './model';

/**
 * Demo stories built from the design board, for the dev route and tests. Not
 * real data: money is integer cents. Names and numbers are the board's.
 */
export const SAMPLE_STORIES: Story[] = [
  {
    id: 'brief',
    kind: 'brief',
    title: 'Brief · 07:30',
    tone: 'neutral',
    generatedAt: '2026-10-17T05:30:00.000Z',
    viewed: false,
    cards: [
      {
        id: 'b1',
        tone: 'neutral',
        kicker: 'Today',
        headline: 'bookings today',
        body: 'First at 09:00 with Daniel.',
        number: { value: 5, format: 'count' },
        list: [{ name: 'Daniel', initials: '09:00', detail: 'Haircut' }],
      },
      {
        id: 'b3',
        tone: 'attention',
        kicker: 'Needs a nudge',
        headline: 'client hasn’t confirmed',
        body: 'Tumelo Sithole is booked for 15:00.',
        number: { value: 1, format: 'count' },
        list: [
          {
            name: 'Tumelo Sithole',
            initials: '15:00',
            detail: 'Pedicure · not confirmed',
          },
        ],
        action: { label: 'Remind Tumelo', kind: 'remind' },
      },
      {
        id: 'b4',
        tone: 'positive',
        kicker: 'Booked today',
        headline: 'revenue booked today',
        number: { value: 245000, format: 'money' },
        action: { label: 'Open calendar', deeplink: '/calendar' },
      },
    ],
  },
  {
    id: 'clients',
    kind: 'clients',
    title: 'Client updates · 09:15',
    tone: 'positive',
    generatedAt: '2026-10-17T07:15:00.000Z',
    viewed: false,
    cards: [
      {
        id: 'c1',
        tone: 'positive',
        kicker: 'New clients',
        headline: 'new clients this month',
        number: { value: 3, format: 'count' },
        list: [
          { name: 'Sipho Dlamini', initials: 'SD', detail: '' },
          { name: 'Thandi Mokoena', initials: 'TM', detail: '' },
          { name: 'Lindiwe Khumalo', initials: 'LK', detail: '' },
        ],
      },
      {
        id: 'c3',
        tone: 'positive',
        kicker: 'Welcome back',
        headline: 'clients came back',
        number: { value: 6, format: 'count' },
        list: [
          {
            name: 'Megan Botha',
            initials: 'MB',
            detail: 'Silk press · back after 6 weeks',
          },
          {
            name: 'Johan Pretorius',
            initials: 'JP',
            detail: 'Fade & beard trim · back after 6 weeks',
          },
          {
            name: 'Priya Naidoo',
            initials: 'PN',
            detail: 'Gel Manicure · back after 6 weeks',
          },
        ],
      },
      {
        id: 'c4',
        tone: 'positive',
        kicker: 'Mostly positive',
        headline: 'clients left feedback',
        number: { value: 5, format: 'count' },
        emotion: 'delighted',
        list: [
          {
            name: 'Megan',
            initials: 'M',
            detail: '“Loved my silk press, Anneke is a star” · 5 stars',
          },
          {
            name: 'Daniel',
            initials: 'D',
            detail: '“Waited 15 min past my time” · 3 stars',
          },
          {
            name: 'Priya',
            initials: 'P',
            detail: '“So easy to book on WhatsApp” · 5 stars',
          },
        ],
      },
    ],
  },
  {
    id: 'business',
    kind: 'business',
    title: 'Business update · 07:30',
    tone: 'concern',
    generatedAt: '2026-10-17T05:30:00.000Z',
    viewed: true,
    cards: [
      {
        id: 'n1',
        tone: 'positive',
        kicker: 'This week',
        headline: 'booked',
        body: 'Up 12% on last week.',
        number: { value: 1480000, format: 'money' },
      },
      {
        id: 'n2',
        tone: 'concern',
        kicker: 'No-shows',
        headline: 'No-shows: 1',
        body: 'Daniel, Thursday.',
        list: [
          {
            name: 'Daniel',
            initials: 'Thu 14:00',
            detail: 'Haircut · didn’t come',
          },
        ],
      },
    ],
  },
  {
    id: 'product',
    kind: 'product',
    title: 'Product updates · 17 Oct',
    tone: 'neutral',
    generatedAt: '2026-10-17T05:00:00.000Z',
    viewed: true,
    cards: [
      {
        id: 'p1',
        tone: 'positive',
        kicker: '',
        headline: 'Say “undo”',
        body: 'Clovie can now take back a booking she just made. Just say “undo” within 30 seconds.',
        demo: 'undo',
        action: { label: 'Try it', kind: 'try_undo' },
      },
      {
        id: 'p2',
        tone: 'neutral',
        kicker: '',
        headline: 'Clovie knows your clients by name',
        body: 'Say “Book Thandi for a silk press”. If there are two Thandis, she’ll ask which one.',
        demo: 'names',
      },
      {
        id: 'p3',
        tone: 'neutral',
        kicker: 'What’s new',
        headline: 'What’s new in this version',
        emotion: 'presenter',
        list: [
          {
            name: 'Say “undo”',
            initials: '',
            detail: 'Take back a booking within 30 seconds.',
          },
          {
            name: 'Knows clients by name',
            initials: '',
            detail: 'Asks which one when two share a name.',
          },
        ],
      },
    ],
  },
];
