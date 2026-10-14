import type { TeamDTO } from '@shared/api';

import { ApiError } from '@/lib/api';

import {
  accessNote,
  buildTeam,
  inviteSchema,
  personSubtitle,
  teamErrorKey,
  type StaffPerson,
} from '../logic';

const person = (id: string, name: string): StaffPerson => ({
  id,
  name,
  title: 'Stylist',
  email: null,
  color: null,
  is_active: true,
  accepts_bookings: true,
});

const team: TeamDTO = {
  members: [
    {
      user_id: 'u1',
      name: 'Thandi',
      email: 't@x.co',
      role: 'owner',
      staff_id: 's1',
      is_self: true,
    },
    {
      user_id: 'u9',
      name: null,
      email: 'ghost@x.co',
      role: 'staff',
      staff_id: null,
      is_self: false,
    },
  ],
  invitations: [
    {
      id: 'i2',
      email: 'ruan@x.co',
      role: 'staff',
      staff_id: 's2',
      created_at: '2026-10-01T08:00:00Z',
    },
    {
      id: 'i9',
      email: 'new@x.co',
      role: 'staff',
      staff_id: null,
      created_at: '2026-10-02T08:00:00Z',
    },
  ],
};

describe('buildTeam', () => {
  const staff = [
    person('s1', 'Thandi'),
    person('s2', 'Ruan'),
    person('s3', 'Aisha'),
  ];
  const people = buildTeam(staff, team);

  it('marks a person with a login a member, with the login role', () => {
    expect(people[0]).toMatchObject({
      key: 's1',
      access: 'member',
      role: 'owner',
    });
    expect(people[0].member?.user_id).toBe('u1');
  });

  it('marks a person with a pending invitation invited', () => {
    expect(people[1]).toMatchObject({ key: 's2', access: 'invited' });
    expect(people[1].invitation?.id).toBe('i2');
  });

  it('marks a person with neither as having no app access', () => {
    expect(people[2]).toMatchObject({
      key: 's3',
      access: 'none',
      role: null,
      member: null,
      invitation: null,
    });
  });

  it('keeps logins and invitations with no staff row as their own rows', () => {
    expect(people.slice(3).map((p) => [p.key, p.name, p.access])).toEqual([
      ['member:u9', 'ghost@x.co', 'member'],
      ['invite:i9', 'new@x.co', 'invited'],
    ]);
    expect(people[3].staff).toBeNull();
  });

  it('does not show an invitation for someone who already has a login', () => {
    const both = buildTeam([person('s1', 'Thandi')], {
      members: team.members.slice(0, 1),
      invitations: [{ ...team.invitations[0], staff_id: 's1' }],
    });
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ access: 'member', invitation: null });
  });

  it('shows every staff row as no access when the team is unavailable', () => {
    expect(buildTeam(staff, undefined).map((p) => p.access)).toEqual([
      'none',
      'none',
      'none',
    ]);
  });

  it('handles nobody at all', () => {
    expect(buildTeam([], undefined)).toEqual([]);
  });
});

describe('accessNote', () => {
  const people = buildTeam(
    [person('s1', 'Thandi'), person('s2', 'Ruan'), person('s3', 'Aisha')],
    team,
  );
  it.each([
    [0, 'owner'],
    [1, 'invited'],
    [2, 'none'],
  ] as const)('person %i is %s', (index, expected) => {
    expect(accessNote(people[index])).toBe(expected);
  });

  it('says nothing about a staff-role member', () => {
    const [staffMember] = buildTeam([person('s5', 'Lerato')], {
      members: [
        {
          user_id: 'u5',
          name: 'Lerato',
          email: null,
          role: 'staff',
          staff_id: 's5',
          is_self: false,
        },
      ],
      invitations: [],
    });
    expect(accessNote(staffMember)).toBeNull();
  });
});

describe('teamErrorKey', () => {
  const failure = (code: ApiError['code'], details?: Record<string, unknown>) =>
    new ApiError({ code, message: 'x', status: 422, details });

  it.each([
    ['LAST_OWNER', 'team.errors.LAST_OWNER'],
    ['ALREADY_MEMBER', 'team.errors.ALREADY_MEMBER'],
    ['ALREADY_INVITED', 'team.errors.ALREADY_INVITED'],
    ['STAFF_ALREADY_LINKED', 'team.errors.STAFF_ALREADY_LINKED'],
  ])('maps the %s rule', (rule, key) => {
    expect(teamErrorKey(failure('RULE_VIOLATION', { rule }))).toBe(key);
  });

  it('maps FORBIDDEN', () => {
    expect(teamErrorKey(failure('FORBIDDEN'))).toBe('team.errors.FORBIDDEN');
  });

  it('leaves unknown rules, other codes and non-API errors to the generic message', () => {
    expect(
      teamErrorKey(failure('RULE_VIOLATION', { rule: 'OTHER' })),
    ).toBeNull();
    expect(teamErrorKey(failure('RULE_VIOLATION'))).toBeNull();
    expect(teamErrorKey(failure('NOT_FOUND'))).toBeNull();
    expect(teamErrorKey(new Error('boom'))).toBeNull();
  });
});

describe('inviteSchema', () => {
  const t = (key: string) => key;
  const parse = (email: string) => inviteSchema(t).safeParse({ email });

  it('accepts an email and trims it', () => {
    const result = parse('  Aisha@Example.com ');
    expect(result.success && result.data.email).toBe('Aisha@Example.com');
  });

  it.each([
    ['', 'forms.required'],
    ['   ', 'forms.required'],
    ['aisha', 'forms.invalidEmail'],
    ['aisha@', 'forms.invalidEmail'],
    ['a b@example.com', 'forms.invalidEmail'],
  ])('rejects %j with %s', (email, message) => {
    const result = parse(email);
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(message);
  });
});

describe('personSubtitle', () => {
  const t = (key: string) =>
    ({
      'team.access.owner': 'Owner',
      'team.access.invited': 'Invite pending',
      'team.access.none': 'No app access',
      'team.status.inactive': 'Inactive',
      'team.status.paused': 'Not taking bookings',
    })[key] ?? key;
  const [thandi, ruan, aisha] = buildTeam(
    [person('s1', 'Thandi'), person('s2', 'Ruan'), person('s3', 'Aisha')],
    team,
  );

  it('joins the job with the access note', () => {
    expect(personSubtitle(thandi, t)).toBe('Stylist · Owner');
    expect(personSubtitle(ruan, t)).toBe('Stylist · Invite pending');
    expect(personSubtitle(aisha, t)).toBe('Stylist · No app access');
  });

  it('adds inactive and paused people as exceptions, after the access note', () => {
    expect(
      personSubtitle(
        { ...aisha, staff: { ...aisha.staff!, is_active: false } },
        t,
      ),
    ).toBe('Stylist · No app access · Inactive');
    expect(
      personSubtitle(
        { ...thandi, staff: { ...thandi.staff!, accepts_bookings: false } },
        t,
      ),
    ).toBe('Stylist · Owner · Not taking bookings');
  });

  it('copes with a login that has no job or staff row', () => {
    const [, , , ghost] = buildTeam(
      [person('s1', 'Thandi'), person('s2', 'Ruan'), person('s3', 'Aisha')],
      team,
    );
    expect(personSubtitle(ghost, t)).toBe('');
  });
});
