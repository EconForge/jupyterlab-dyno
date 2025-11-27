import { LanguageSupport, StreamLanguage } from '@codemirror/language';

// Mode definition for DYNO syntax highlighting
export const dynoMode = {
  name: 'dyno',
  startState: () => ({ inComment: false }),
  token: (stream: any) => {
    // Comments starting with #
    if (stream.match(/^#.*/)) {
      return 'comment';
    }
    
    // Section headers (comments that define sections)
    if (stream.match(/^#\s*(parameters|equations|steady state|shocks)/i)) {
      return 'meta';
    }
    
    // Keywords for model blocks
    if (stream.match(/\b(var|varexo|parameters|model|steady_state_model|shocks|end)\b/)) {
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
    if (stream.match(/\b([t~]([+\-]\d+)?|\d+)\b/)) {
      return 'time-subscript';
    }
    
    // Opening and closing brackets (will inherit variable color when following variables)
    if (stream.match(/[\[\]]/)) {
      return 'bracket';
    }
    
    // Common economic variables (can be customized)
    if (stream.match(/\b(c|k|y|n|r|w|i|a|beta|delta|alpha|rho|khi|eta|nss|epsilon|leta)\b/)) {
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
    if (stream.match(/\b(var|varexo|varendo|parameters|model|initval|endval|steady_state_model|shocks|estimated_params|end)\b/)) {
      const word = stream.current();
      if (word === 'model' || word === 'steady_state_model' || word === 'shocks') {
        state.inBlock = word;
      } else if (word === 'end') {
        state.inBlock = null;
      }
      return 'keyword';
    }
    
    // Mathematical functions
    if (stream.match(/\b(log|exp|sin|cos|tan|sqrt|abs|max|min|steady_state|normcdf|normpdf)\b/)) {
      return 'builtin';
    }
    
    // Numbers
    if (stream.match(/\b\d*\.?\d+([eE][+-]?\d+)?\b/)) {
      return 'number';
    }
    
    // Time subscripts for MOD files: (+1), (-1) or [t], [t+1], etc.
    if (stream.match(/\([+\-]\d+\)/)) {
      return 'time-subscript';
    }
    
    // Time subscripts content for bracket notation (t, t+1, t-1, ~, 1, 2, etc.)
    if (stream.match(/\b([t~]([+\-]\d+)?|\d+)\b/)) {
      return 'time-subscript';
    }
    
    // Opening and closing brackets
    if (stream.match(/[\[\]]/)) {
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

// Create language supports
export function dyno(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(dynoMode));
}

export function mod(): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(modMode));
}