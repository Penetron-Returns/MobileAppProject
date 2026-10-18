import { buildClovieHtml } from '../clovieHtml';

describe('buildClovieHtml', () => {
  it('builds the page once per state and size, so a re-render never rebuilds it', () => {
    expect(buildClovieHtml('working', 140)).toBe(
      buildClovieHtml('working', 140),
    );
  });

  it('carries the state and a scaled canvas size', () => {
    const html = buildClovieHtml('default', 100);
    expect(html).toContain('"state":"default"');
    expect(html).toContain('"size":"130px"');
  });
});
