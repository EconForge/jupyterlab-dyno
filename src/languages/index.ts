import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { dyno, mod } from './dyno-language';

/**
 * Register the custom language modes with JupyterLab's editor system
 */
export function registerLanguages(editorLanguages: IEditorLanguageRegistry): void {
  // Register DYNO language mode
  editorLanguages.addLanguage({
    name: 'dyno',
    mime: 'text/x-dyno',
    load: async () => {
      return dyno();
    }
  });

  // Register MOD language mode  
  editorLanguages.addLanguage({
    name: 'mod',
    mime: 'text/x-mod',
    load: async () => {
      return mod();
    }
  });

  // Also register for the existing MIME type
  editorLanguages.addLanguage({
    name: 'dyno-alt',
    mime: 'text/mod', // This is your existing MIME type
    load: async () => {
      return dyno();
    }
  });
}