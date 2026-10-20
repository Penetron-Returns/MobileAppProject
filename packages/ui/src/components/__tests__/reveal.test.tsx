import { render } from '../../testing/render';
import { Text } from '../../primitives/Text';
import { Reveal } from '../Reveal';

const animates = (tree: ReturnType<typeof render>) =>
  tree.root.findAll((n) => n.props.entering !== undefined).length > 0;

const row = (scope: string, index: number, skip?: boolean) =>
  render(
    <Reveal scope={scope} index={index} skip={skip}>
      <Text>row</Text>
    </Reveal>,
  );

describe('Reveal', () => {
  it('animates the first rows of a list', () => {
    expect(animates(row('r-first', 0))).toBe(true);
  });
  it('shows rows beyond the sixth still', () => {
    expect(animates(row('r-long', 6))).toBe(false);
  });
  it('shows a list that came from the cache still', () => {
    expect(animates(row('r-cache', 0, true))).toBe(false);
  });
});
