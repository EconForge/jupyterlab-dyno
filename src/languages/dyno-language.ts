import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export interface IDynoState {
  inComment: boolean;
  inMarkdown: boolean;
  headerLevel: number;
}

// Mode definition for DYNO syntax highlighting
export const dynoMode = {
  name: 'dyno',
  startState: (): IDynoState => ({
    inComment: false,
    inMarkdown: false,
    headerLevel: 0
  }),
  copyState: (state: IDynoState): IDynoState => ({ ...state }),
  blankLine: (state: IDynoState): void => {
    state.inMarkdown = false;
    state.headerLevel = 0;
  },
  tokenTable: {
    'time-subscript': t.atom,
    header: t.heading,
    'header-1': t.heading1,
    'header-2': t.heading2,
    'header-3': t.heading3,
    'header-4': t.heading4,
    'header-5': t.heading5,
    'header-6': t.heading6
  },
  token: (stream: any, state: IDynoState) => {
    // Reset markdown state at start of line
    if (stream.sol()) {
      state.inMarkdown = false;
      state.headerLevel = 0;
      // Match markdown header lines starting with ## (e.g. ##, ###)
      if (stream.match(/^\s*#{2,6}(\s+|$)/)) {
        state.inMarkdown = true;
        return 'comment';
      }
    }

    // Markdown content tokenization on ## lines
    if (state.inMarkdown) {
      if (stream.eatSpace()) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel}`
          : 'comment';
      }

      // Check for markdown heading prefix like "# ", "## ", "### " inside ## line
      if (state.headerLevel === 0 && stream.match(/^#{1,6}(\s+|$)/)) {
        const hashMatch = stream.current().trim();
        state.headerLevel = Math.min(hashMatch.length, 6);
        return `header header-${state.headerLevel}`;
      }

      // Escaped characters
      if (stream.match(/^\\./)) {
        return 'escape';
      }

      // Bold + Italic: ***text*** or ___text___ or **_text_** or _**text**_
      if (stream.match(/^\*\*\*(?!\s)[^*\r\n]+(?<!\s)\*\*\*/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong emphasis`
          : 'strong emphasis';
      }
      if (stream.match(/^\*\*_(?!\s)[^_\r\n]+(?<!\s)_\*\*/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong emphasis`
          : 'strong emphasis';
      }
      if (
        stream.match(/^_\*\*(?!\s)[^*\r\n]+(?<!\s)\*\*_/) &&
        (stream.pos <= 3 || !/\w/.test(stream.string[stream.pos - 4]))
      ) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong emphasis`
          : 'strong emphasis';
      }

      const prevChar = stream.pos > 0 ? stream.string[stream.pos - 1] : ' ';
      const canUnderscore = !/\w/.test(prevChar);

      if (
        canUnderscore &&
        stream.match(/^___(?!\s)[^_\r\n]+(?<!\s)___(?!\w)/)
      ) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong emphasis`
          : 'strong emphasis';
      }

      // Bold: **text** or __text__
      if (stream.match(/^\*\*(?!\s)[^*\r\n]+(?<!\s)\*\*/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong`
          : 'strong';
      }
      if (canUnderscore && stream.match(/^__(?!\s)[^_\r\n]+(?<!\s)__(?!\w)/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strong`
          : 'strong';
      }

      // Italic: *text* or _text_
      if (stream.match(/^\*(?!\s)[^*\r\n]+(?<!\s)\*/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} emphasis`
          : 'emphasis';
      }
      if (canUnderscore && stream.match(/^_(?!\s)[^_\r\n]+(?<!\s)_(?!\w)/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} emphasis`
          : 'emphasis';
      }

      // Inline code: `code`
      if (stream.match(/^`[^`\r\n]+`/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} monospace`
          : 'monospace';
      }

      // Strikethrough: ~~text~~
      if (stream.match(/^~~(?!\s)[^~\r\n]+(?<!\s)~~/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} strikethrough`
          : 'strikethrough';
      }

      // Math: $$...$$ or $...$
      if (stream.match(/^\$\$(?!\s)[^$\r\n]+(?<!\s)\$\$/)) {
        return 'atom';
      }
      if (stream.match(/^\$(?!\s)[^$\r\n]+(?<!\s)\$/)) {
        return 'atom';
      }

      // Links: [text](url)
      if (stream.match(/^\[[^\]\r\n]+\]\([^)\r\n]+\)/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel} link`
          : 'link';
      }

      // Plain text up to next potential delimiter or space
      if (stream.match(/^[^*_`~$[\\] \t]+/)) {
        return state.headerLevel > 0
          ? `header header-${state.headerLevel}`
          : 'comment';
      }

      stream.next();
      return state.headerLevel > 0
        ? `header header-${state.headerLevel}`
        : 'comment';
    }

    // Comments starting with #
    if (stream.match(/^#.*/)) {
      return 'comment';
    }

    // Keywords for model blocks
    if (
      stream.match(
        /\b(var|varexo|parameters|model|steady_state_model|shocks|end)\b/
      )
    ) {
      return 'keyword';
    }

    // Mathematical functions
    if (stream.match(/\b(log|exp|sin|cos|tan|sqrt|abs|max|min)\b/)) {
      return 'builtin';
    }

    // Parameter assignment arrow
    if (stream.match(/<-/)) {
      return 'operator';
    }

    // Numbers (integers, decimals, scientific notation)
    if (stream.match(/\b\d*\.?\d+([eE][+-]?\d+)?\b/)) {
      return 'number';
    }

    // Time subscripts content (t, t+1, t-1, ~, 1, 2, etc.) - match the content inside brackets
    if (stream.match(/\b([t~]([+-]\d+)?|\d+)\b/)) {
      return 'time-subscript';
    }

    // Opening and closing brackets (will inherit variable color when following variables)
    if (stream.match(/[[\]]/)) {
      return 'bracket';
    }

    // Common economic variables (can be customized)
    if (
      stream.match(
        /\b(c|k|y|n|r|w|i|a|beta|delta|alpha|rho|khi|eta|nss|epsilon|leta)\b/
      )
    ) {
      return 'variable';
    }

    // Distribution notation for shocks N(0, sigma)
    if (stream.match(/\bN(?=\()/)) {
      return 'builtin';
    }

    // Operators and punctuation
    if (stream.match(/[+\-*/=<>^()[\]{}]/)) {
      return 'operator';
    }

    // Skip whitespace
    if (stream.match(/\s+/)) {
      return null;
    }

    // Identifiers (variables not in the common list)
    if (stream.match(/[a-zA-Z_]\w*/)) {
      return 'variable-2';
    }

    // Skip any unrecognized character
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '#' },
    indentOnInput: /^\s*end\s*$/,
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] }
  }
};

// Mode definition for MOD files (Dynare syntax)
export const modMode = {
  name: 'mod',
  startState: () => ({ inComment: false, inBlock: null }),
  tokenTable: {
    'time-subscript': t.atom
  },
  token: (stream: any, state: any) => {
    // Block comments /* ... */
    if (state.inComment) {
      if (stream.match(/.*?\*\//)) {
        state.inComment = false;
        return 'comment';
      }
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match(/\/\*/)) {
      state.inComment = true;
      return 'comment';
    }

    // Line comments //
    if (stream.match(/\/\/.*/)) {
      return 'comment';
    }

    // Dynare block keywords
    if (
      stream.match(
        /\b(var|varexo|varendo|parameters|model|initval|endval|steady_state_model|shocks|estimated_params|end)\b/
      )
    ) {
      const word = stream.current();
      if (
        word === 'model' ||
        word === 'steady_state_model' ||
        word === 'shocks'
      ) {
        state.inBlock = word;
      } else if (word === 'end') {
        state.inBlock = null;
      }
      return 'keyword';
    }

    // Mathematical functions
    if (
      stream.match(
        /\b(log|exp|sin|cos|tan|sqrt|abs|max|min|steady_state|normcdf|normpdf)\b/
      )
    ) {
      return 'builtin';
    }

    // Numbers
    if (stream.match(/\b\d*\.?\d+([eE][+-]?\d+)?\b/)) {
      return 'number';
    }

    // Time subscripts for MOD files: (+1), (-1) or [t], [t+1], etc.
    if (stream.match(/\([+-]\d+\)/)) {
      return 'time-subscript';
    }

    // Time subscripts content for bracket notation (t, t+1, t-1, ~, 1, 2, etc.)
    if (stream.match(/\b([t~]([+-]\d+)?|\d+)\b/)) {
      return 'time-subscript';
    }

    // Opening and closing brackets
    if (stream.match(/[[\]]/)) {
      return 'bracket';
    }

    // Assignment and comparison operators
    if (stream.match(/[=<>]=?|<-/)) {
      return 'operator';
    }

    // Arithmetic operators
    if (stream.match(/[+\-*/^]/)) {
      return 'operator';
    }

    // Punctuation
    if (stream.match(/[()[\]{},.;]/)) {
      return 'punctuation';
    }

    // Variables
    if (stream.match(/[a-zA-Z_]\w*/)) {
      return 'variable';
    }

    // Skip whitespace
    if (stream.match(/\s+/)) {
      return null;
    }

    // Skip any unrecognized character
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    indentOnInput: /^\s*end\s*$/,
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] }
  }
};

// Highlight style for Dyno markdown formatting (emphasis, bold, code, headings)
export const dynoHighlightStyle = HighlightStyle.define([
  {
    tag: t.heading1,
    fontSize: '1.25em',
    fontWeight: 'bold',
    color: 'var(--jp-dyno-header1-color, #025955)'
  },
  {
    tag: t.heading2,
    fontSize: '1.15em',
    fontWeight: 'bold',
    color: 'var(--jp-dyno-header2-color, #007a87)'
  },
  {
    tag: t.heading3,
    fontSize: '1.05em',
    fontWeight: 'bold',
    color: 'var(--jp-dyno-header3-color, #007a87)'
  },
  {
    tag: t.heading,
    fontWeight: 'bold',
    color: 'var(--jp-dyno-header-color, #007a87)'
  },
  {
    tag: t.strong,
    color: 'var(--jp-dyno-strong-color, #b55000)',
    fontWeight: 'bold'
  },
  {
    tag: t.emphasis,
    color: 'var(--jp-dyno-emphasis-color, #8a3b8f)',
    fontStyle: 'italic'
  },
  {
    tag: t.monospace,
    color: 'var(--jp-dyno-monospace-color, #a31515)'
  },
  {
    tag: t.strikethrough,
    textDecoration: 'line-through'
  },
  {
    tag: t.link,
    color: 'var(--jp-dyno-link-color, #0366d6)',
    textDecoration: 'underline'
  }
]);

// Create language supports
export function dyno(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(dynoMode), [
    syntaxHighlighting(dynoHighlightStyle)
  ]);
}

export function mod(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(modMode));
}
