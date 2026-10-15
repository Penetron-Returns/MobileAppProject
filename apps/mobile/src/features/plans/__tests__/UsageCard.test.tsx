import type { BillingUsageDTO } from '@booking/types';
import * as React from 'react';

import { mount, text } from '@/testing/render';

import { UsageCard } from '../components/UsageCard';

function usage(over: Partial<BillingUsageDTO>): BillingUsageDTO {
  return {
    plan: 'growth',
    month: '2026-10',
    completed_jobs: 63,
    included_jobs: 100,
    usage_percent: 63,
    usage_state: 'normal',
    extra_jobs: 0,
    extra_cost_cents: 0,
    resets_on: '2026-11-01',
    ...over,
  };
}

const bar = (tree: ReturnType<typeof mount>) =>
  tree.root.find((n) => n.props.accessibilityRole === 'progressbar');

describe('UsageCard', () => {
  it('normal: the count, the reset day and the reassurance, no warning', () => {
    const tree = mount(<UsageCard usage={usage({})} planName="Growth" />);
    const out = text(tree);
    expect(out).toContain('Growth');
    expect(out).toContain('Your plan');
    expect(out).toContain('63 of 100 jobs this month · resets 1 Nov');
    expect(out).toContain('Nothing is ever cut off');
    expect(out).not.toContain('close to your limit');
    expect(bar(tree).props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 63,
    });
  });

  it('near: warns, and says nothing stops', () => {
    const out = text(
      mount(
        <UsageCard
          usage={usage({
            completed_jobs: 86,
            usage_percent: 86,
            usage_state: 'near',
          })}
          planName="Growth"
        />,
      ),
    );
    expect(out).toContain('86 of 100 jobs this month');
    expect(out).toContain("You're close to your limit");
    expect(out).toContain(
      'Nothing stops at the limit. Extra jobs are R4 each, billed at month end.',
    );
  });

  it('over: counts the extra jobs and what they cost so far', () => {
    const out = text(
      mount(
        <UsageCard
          usage={usage({
            completed_jobs: 104,
            usage_percent: 104,
            usage_state: 'over',
            extra_jobs: 4,
            extra_cost_cents: 1600,
          })}
          planName="Growth"
        />,
      ),
    );
    expect(out).toContain('104 of 100 · 4 extra jobs, R16 so far');
    expect(out).toContain("You're over your limit");
    expect(out).toContain('Nothing was cut off.');
    expect(out).toContain('Resets 1 Nov.');
  });

  it('says "1 extra job" for one', () => {
    const out = text(
      mount(
        <UsageCard
          usage={usage({
            completed_jobs: 101,
            usage_percent: 101,
            usage_state: 'over',
            extra_jobs: 1,
            extra_cost_cents: 400,
          })}
          planName="Growth"
        />,
      ),
    );
    expect(out).toContain('1 extra job, R4 so far');
  });
});
