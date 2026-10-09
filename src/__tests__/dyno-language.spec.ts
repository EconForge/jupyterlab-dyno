import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { dyno, dynoMode } from '../languages/dyno-language';

describe('dynoMode syntax highlighting', () => {
  function getTokens(
    doc: string
  ): Array<{ name: string; text: string; from: number; to: number }> {
    const state = EditorState.create({
      doc,
      extensions: [dyno()]
    });
    const tree = syntaxTree(state);
    const tokens: Array<{
      name: string;
      text: string;
      from: number;
      to: number;
    }> = [];

    const cursor = tree.cursor();
    do {
      if (cursor.name !== 'Document') {
        tokens.push({
          name: cursor.name,
          text: doc.slice(cursor.from, cursor.to),
          from: cursor.from,
          to: cursor.to
        });
      }
    } while (cursor.next());

    return tokens;
  }

  it('should export dynoMode and dyno LanguageSupport', () => {
    expect(dynoMode).toBeDefined();
    expect(dynoMode.name).toBe('dyno');
    expect(dyno).toBeDefined();
    expect(typeof dyno).toBe('function');
  });

  describe('Markdown on ## lines', () => {
    it('should highlight ## and plain text with comment base and format markdown elements', () => {
      const doc = '## Note with _jlkj_, *ljlij*, **jlkjlkj**';
      const tokens = getTokens(doc);

      const prefixToken = tokens.find(t => t.text.startsWith('##'));
      expect(prefixToken).toBeDefined();
      expect(prefixToken?.name).toBe('comment');

      const underscoreEm = tokens.find(t => t.text === '_jlkj_');
      expect(underscoreEm).toBeDefined();
      expect(underscoreEm?.name).toBe('emphasis');

      const starEm = tokens.find(t => t.text === '*ljlij*');
      expect(starEm).toBeDefined();
      expect(starEm?.name).toBe('emphasis');

      const strongToken = tokens.find(t => t.text === '**jlkjlkj**');
      expect(strongToken).toBeDefined();
      expect(strongToken?.name).toBe('strong');
    });

    it('should correctly parse the user screenshot example', () => {
      const doc = [
        '## *Now this intalics*',
        '',
        '## And this, is in __bold__ .',
        '',
        '##'
      ].join('\n');
      const tokens = getTokens(doc);

      const italicToken = tokens.find(t => t.text === '*Now this intalics*');
      expect(italicToken).toBeDefined();
      expect(italicToken?.name).toBe('emphasis');

      const boldToken = tokens.find(t => t.text === '__bold__');
      expect(boldToken).toBeDefined();
      expect(boldToken?.name).toBe('strong');

      const commentTokens = tokens.filter(t => t.name === 'comment');
      expect(commentTokens.length).toBeGreaterThanOrEqual(3);
    });

    it('should support bold with underscores and bold italic', () => {
      const doc = '## Title with __bold__ and ***bold italic***';
      const tokens = getTokens(doc);

      const strongUnder = tokens.find(t => t.text === '__bold__');
      expect(strongUnder).toBeDefined();
      expect(strongUnder?.name).toBe('strong');

      const boldItalic = tokens.find(t => t.text === '***bold italic***');
      expect(boldItalic).toBeDefined();
      expect(boldItalic?.name).toBe('strong_emphasis');
    });

    it('should support monospace code, strikethrough, and links', () => {
      const doc =
        '## Info with `inline_code` and ~~strike~~ and [link](https://dyno.org)';
      const tokens = getTokens(doc);

      const codeToken = tokens.find(t => t.text === '`inline_code`');
      expect(codeToken).toBeDefined();
      expect(codeToken?.name).toBe('monospace');

      const strikeToken = tokens.find(t => t.text === '~~strike~~');
      expect(strikeToken).toBeDefined();
      expect(strikeToken?.name).toBe('strikethrough');

      const linkToken = tokens.find(t => t.text === '[link](https://dyno.org)');
      expect(linkToken).toBeDefined();
      expect(linkToken?.name).toBe('link');
    });

    it('should not treat intra-word underscores as emphasis', () => {
      const doc = '## Model variable alpha_param and beta_param';
      const tokens = getTokens(doc);

      const emphasisTokens = tokens.filter(t => t.name === 'emphasis');
      expect(emphasisTokens.length).toBe(0);
    });

    it('should only apply markdown highlighting to ## lines and reset on subsequent lines', () => {
      const doc = [
        '## Heading with **bold**',
        'beta <- 0.98',
        '# A regular comment',
        'c[t] = beta*c[t+1]'
      ].join('\n');

      const tokens = getTokens(doc);

      const strongToken = tokens.find(t => t.text === '**bold**');
      expect(strongToken).toBeDefined();
      expect(strongToken?.name).toBe('strong');

      const betaToken = tokens.find(
        t => t.text === 'beta' && t.from === doc.indexOf('beta')
      );
      expect(betaToken).toBeDefined();
      expect(betaToken?.name).toBe('variableName');

      const commentToken = tokens.find(t => t.text === '# A regular comment');
      expect(commentToken).toBeDefined();
      expect(commentToken?.name).toBe('comment');
    });
  });

  describe('Comments', () => {
    it('should highlight all lines starting with # as comments', () => {
      const doc = [
        '# parameters',
        'beta <- 0.98',
        '# equations',
        'y[t] = c[t]'
      ].join('\n');

      const tokens = getTokens(doc);

      const paramComment = tokens.find(t => t.text === '# parameters');
      expect(paramComment).toBeDefined();
      expect(paramComment?.name).toBe('comment');

      const eqComment = tokens.find(t => t.text === '# equations');
      expect(eqComment).toBeDefined();
      expect(eqComment?.name).toBe('comment');
    });

    it('should treat ##> as a regular comment instead of markdown header', () => {
      const doc = '##> some output marker';
      const tokens = getTokens(doc);

      expect(tokens.length).toBe(1);
      expect(tokens[0].name).toBe('comment');
      expect(tokens[0].text).toBe('##> some output marker');
    });
  });
});
