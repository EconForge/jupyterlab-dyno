import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  DocumentModel,
  IDocumentWidget
} from '@jupyterlab/docregistry';

import { ActivityMonitor } from '@jupyterlab/coreutils';

import { IWidgetTracker, WidgetTracker } from '@jupyterlab/apputils';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';

import { Token } from '@lumino/coreutils';

import { SessionContext } from '@jupyterlab/apputils';

import { KernelMessage, ServiceManager } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  OutputArea,
  OutputAreaModel,
  SimplifiedOutputArea
} from '@jupyterlab/outputarea';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';

import { dyno, mod } from './languages/dyno-language';
import { startSyntaxHighlightingMonitor } from './languages/simple-syntax';

// Default settings, see schema/plugin.json for more details
let global_setting = {};
let preserveScrollPosition = true;

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'text/mod';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'jupyterlab-dyno';

/**
 * Timeout between modification and render in milliseconds
 */
const RENDER_TIMEOUT = 10;

/**
 * Link to Plotly's CDN, used to render IRFs
 */
const PLOTLY_CDN_URL = 'https://cdn.plot.ly/plotly-3.1.0.min.js';

/**
 * Plugin id, follows a strict convention
 * package name: "jupyterlab-dyno" needs to be the same as package.json
 * settings name: "plugin" needs to be the file name in schema/ that describes extension settings (here plugin.json)
 */
const PLUGIN_ID = 'jupyterlab-dyno:plugin';

/**
 * DynareWidget: widget that represents the solution of a mod file
 */
export class DynareWidget
  extends DocumentWidget<SimplifiedOutputArea, DocumentModel>
  implements IDocumentWidget<SimplifiedOutputArea, DocumentModel>
{
  constructor(
  options: DocumentWidget.IOptions<SimplifiedOutputArea, DocumentModel>,
  servicemanager: ServiceManager.IManager,
  rendermime: IRenderMimeRegistry
  ) {
    super(options);
    this.addClass(CLASS_NAME);
  this._rendermime = rendermime;
    this._sessionContext = new SessionContext({
      sessionManager: servicemanager.sessions,
      specsManager: servicemanager.kernelspecs,
      name: `Dyno-${Math.random().toString(36).substr(2, 9)}`, // Unique name to force new kernel
      kernelPreference: {
        name: 'xpython',
        canStart: true,
        shouldStart: true,
        autoStartDefault: true
      }
    });
    this._sessionContext.startKernel().then(res => {
      console.log('Started kernel session');
      void this.context.ready.then(() => {
        // Check if we already have content to avoid showing loading unnecessarily
        const data = this.context.model.toString();
        if (data && data.trim() !== '') {
          // File has content, proceed normally
          this._isFirstRender = false;
          this.update();
        } else {
          // No content yet, show loading for first render
          this._showInitialLoading();
        }
        
        this._monitor = new ActivityMonitor({
          signal: this.context.model.contentChanged,
          timeout: RENDER_TIMEOUT
        });
        this._monitor.activityStopped.connect(this.update, this);
      });
    });
    const js = document.createElement('script');
    js.src = PLOTLY_CDN_URL;
    this.content.node.appendChild(js);
    
    // Show initial loading content in the output area
    this._showInitialLoading();
  }

  protected onUpdateRequest(): void {
    if (this._renderPending) {
      return;
    }
    this._renderPending = true;
    
    void this._renderModel().then(() => {
      this._renderPending = false;
      this._isFirstRender = false;
    }).catch(() => {
      this._renderPending = false;
      this._isFirstRender = false;
    });
  }
  
  /**
   * Show initial loading content in the output area
   */
  private _showInitialLoading(): void {
    console.log('Showing initial loading content');
    
    // Create loading HTML content that works within the output area
    const loadingHtml = `
      <div class="jp-DynareWidget-loading-container" style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 40px;
        text-align: center;
        min-height: 300px;
        background-color: rgba(248, 249, 250, 0.95);
        border-radius: 8px;
        margin: 20px;
        border: 1px solid #e9ecef;
      ">
        <div class="jp-DynareWidget-loading-image"></div>
        <div class="jp-DynareWidget-loading-text">🦖 Starting kernel and processing...</div>
      </div>
    `;
    
    // Add HTML output to the output area
    const output = {
      output_type: 'display_data',
      data: {
        'text/html': loadingHtml
      },
      metadata: {}
    };
    
    // Clear any existing content first and add loading content
    this.content.model.clear();
    this.content.model.add(output);
    console.log('Loading content added to output area');
  }

  /*
   * Puts solution or error into widget's node
   */
  private async _renderModel(): Promise<void> {
    const data = this.context.model.toString();
    if (data === '') {
      return; // don't try to render empty documents
    }
    
    // Clear the output area if this is the first render (to remove loading content)
    if (this._isFirstRender) {
      this.content.model.clear();
      this._isFirstRender = false;
    }
    
    // Preserve scroll position of the output panel across re-renders (if enabled)
    const container = this.content.node;
    const prevScrollTop = preserveScrollPosition ? container.scrollTop : 0;
    const prevScrollLeft = preserveScrollPosition ? container.scrollLeft : 0;
    const prevScrollableHeight = preserveScrollPosition
      ? Math.max(0, container.scrollHeight - container.clientHeight)
      : 0;
    // Use the document path to branch behavior by file type
    const path = this.context.path.toLowerCase();
    

    const start = performance.now();

    console.log(global_setting);
    
    // Choose kernel code based on file type
    const code = `import warnings
import json
options = json.loads("""${JSON.stringify(global_setting)}""")
warnings.filterwarnings('ignore')
from dyno.report import dsge_report
filename = '${path}'
txt = '''${data}'''
dsge_report(txt=txt, filename=filename, **options)`;

    // Execute in a hidden output area to avoid clearing the visible output unnecessarily
    const tempModel = new OutputAreaModel({ trusted: true });
    const tempArea = new SimplifiedOutputArea({
      model: tempModel,
      rendermime: this._rendermime
    });

    // const prevOutputs = this._safeToJSON(this.content.model);

    // Register comm handler after we're sure the kernel is ready (just before execution)
    this._setupHighlightingComm();

    OutputArea.execute(code, tempArea, this._sessionContext)
      .then((msg: KernelMessage.IExecuteReplyMsg | undefined) => {
        const end = performance.now();
        const nextOutputs = this._safeToJSON(tempModel);

        console.log(`Took ${end - start} milliseconds to render file`);

        // const same = this._outputsEqual(prevOutputs, nextOutputs);
        // if (!same && nextOutputs) {
        //   // Update visible model only if content changed
        //   this._applyOutputsToVisibleModel(nextOutputs);
        // }
        if (nextOutputs) {
          this._applyOutputsToVisibleModel(nextOutputs);
          
          // Note: highlighting is now handled via comm, not from outputs
          // Keep the fallback for backward compatibility
          console.log('[DEBUG] About to call _performHighlightingBasedOnResults with outputs:', nextOutputs);
          this._performHighlightingBasedOnResults(nextOutputs);
        }

        // Restore scroll position after DOM/content updates
        if (preserveScrollPosition) {
          // Use two RAFs to ensure layout and rendering have settled
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const newScrollableHeight = Math.max(
                0,
                container.scrollHeight - container.clientHeight
              );
              const ratio = prevScrollableHeight
                ? prevScrollTop / prevScrollableHeight
                : 0;
              const targetTop = Math.min(
                newScrollableHeight,
                Math.round(ratio * newScrollableHeight)
              );
              // Prefer exact restoration when possible
              const preciseTop = Math.min(newScrollableHeight, prevScrollTop);
              container.scrollTo({
                top: newScrollableHeight > 0 ? preciseTop : 0,
                left: prevScrollLeft,
                behavior: 'auto'
              });
              // If content height changed significantly, fall back to ratio-based position
              if (Math.abs(newScrollableHeight - prevScrollableHeight) > 5) {
                container.scrollTo({ top: targetTop, left: prevScrollLeft });
              }
            });
          });
        }
      })
      .catch(reason => {
        const end = performance.now();
        console.error(reason);
        console.log(
          `Took ${end - start} milliseconds to show error message file`
        );
        // On error, propagate the error outputs to visible model
        const nextOutputs = this._safeToJSON(tempModel);
        if (nextOutputs) {
          this._applyOutputsToVisibleModel(nextOutputs);
        }
        // Attempt to restore previous scroll even on error
        if (preserveScrollPosition) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              container.scrollTo({ top: prevScrollTop, left: prevScrollLeft });
            });
          });
        }
        // Note: loading is now handled in onUpdateRequest
      });
  }

  /**
   * Set up Jupyter Comm for receiving highlighting data from the kernel
   */
  private _setupHighlightingComm(): void {
    try {
      if (!this._sessionContext?.session?.kernel) {
        console.warn('[DEBUG] No kernel available for comm setup');
        return;
      }

      const kernel = this._sessionContext.session.kernel;
      const commTargetName = 'jupyterlab-dyno-highlighting';

      console.log('[DEBUG] Setting up comm with kernel:', kernel.id);
      console.log('[DEBUG] Kernel status:', kernel.status);

      // Check if kernel is ready
      if (kernel.status !== 'idle' && kernel.status !== 'busy') {
        console.warn('[DEBUG] Kernel not ready for comm setup, status:', kernel.status);
        // Retry after a delay
        setTimeout(() => {
          console.log('[DEBUG] Retrying comm setup...');
          this._setupHighlightingComm();
        }, 1000);
        return;
      }

      // Clean up any existing comm targets first
      try {
        // Note: removeCommTarget may not exist or may have different signature
        // This is just for cleanup, so we can ignore errors
        if (typeof (kernel as any).removeCommTarget === 'function') {
          (kernel as any).removeCommTarget(commTargetName, () => {});
          console.log('[DEBUG] Cleaned up existing comm target');
        }
      } catch (e) {
        console.log('[DEBUG] Comm cleanup ignored (expected):', e);
      }

      // Register the comm target with defensive error handling
      try {
        kernel.registerCommTarget(commTargetName, (comm, msg) => {
          try {
            console.log('[DEBUG] ===== COMM MESSAGE RECEIVED =====');
            console.log('[DEBUG] Comm object:', comm);
            console.log('[DEBUG] Message:', msg);
            console.log('[DEBUG] Message content:', msg.content);
            console.log('[DEBUG] Message data:', msg.content.data);
            console.log('[DEBUG] ===================================');
            
            this._handleHighlightingData(msg.content.data);

            // Set up message handler for future messages on this comm
            comm.onMsg = (msg) => {
              try {
                console.log('[DEBUG] ===== SUBSEQUENT COMM MESSAGE =====');
                console.log('[DEBUG] Received comm message:', msg.content.data);
                console.log('[DEBUG] ====================================');
                this._handleHighlightingData(msg.content.data);
              } catch (handlerError) {
                console.error('[DEBUG] Error in comm message handler:', handlerError);
              }
            };

            // Handle comm close
            comm.onClose = (msg) => {
              try {
                console.log('[DEBUG] Comm closed:', msg);
              } catch (closeError) {
                console.error('[DEBUG] Error in comm close handler:', closeError);
              }
            };
          } catch (commError) {
            console.error('[DEBUG] Error in comm target handler:', commError);
          }
        });

        console.log('[DEBUG] Comm target registered successfully:', commTargetName);
        console.log('[DEBUG] Kernel comm targets:', (kernel as any)._commTargets || 'not accessible');
      } catch (registerError) {
        console.error('[DEBUG] Failed to register comm target:', registerError);
      }
    } catch (setupError) {
      console.error('[DEBUG] Error in _setupHighlightingComm:', setupError);
    }
  }

  /**
   * Handle highlighting data received from the kernel via comm
   */
  private _handleHighlightingData(data: any): void {
    try {
      console.log('[DEBUG] _handleHighlightingData called');
      
      if (!data) {
        console.warn('[DEBUG] No highlighting data received');
        return;
      }

      console.log('[DEBUG] Processing highlighting data:', data);

      // Extract highlighting information with safe fallbacks
      const lines = data.lines;
      const type = data.type || 'default';
      const message = data.message || '';

      if (!lines) {
        console.warn('[DEBUG] No lines property in data:', data);
        return;
      }

      if (!Array.isArray(lines)) {
        console.warn('[DEBUG] Lines is not an array:', lines);
        return;
      }

      if (lines.length === 0) {
        console.log('[DEBUG] No lines to highlight');
        return;
      }

      console.log('[DEBUG] Highlighting lines:', lines, 'with type:', type);

      // Get the appropriate CSS class for the highlight type
      const className = this._getHighlightClassName(type);
      console.log('[DEBUG] Using CSS class:', className);

      // Add a small delay to ensure editor is ready
      setTimeout(() => {
        try {
          console.log('[DEBUG] Calling highlightLines...');
          this.highlightLines(lines, className);
          
          if (message) {
            console.log('[DEBUG] Highlighting message:', message);
          }
          console.log('[DEBUG] Highlighting completed successfully');
        } catch (highlightError) {
          console.error('[DEBUG] Error in highlightLines:', highlightError);
        }
      }, 100);
    } catch (error) {
      console.error('[DEBUG] Error handling highlighting data:', error);
    }
  }

  /**
   * Get the appropriate CSS class name for a highlight type
   */
  private _getHighlightClassName(type: string): string {
    switch (type.toLowerCase()) {
      case 'error':
        return 'jp-dyno-error-line';
      case 'warning':
        return 'jp-dyno-warning-line';
      case 'success':
        return 'jp-dyno-success-line';
      case 'info':
        return 'jp-dyno-highlighted-line';
      default:
        return 'jp-dyno-highlighted-line';
    }
  }

  /**
   * Safely extract nbformat outputs as JSON from a model, if available.
   */
  private _safeToJSON(model: any): any[] | null {
    try {
      if (model && typeof model.toJSON === 'function') {
        return model.toJSON();
      }
    } catch (e) {
      console.warn('toJSON() failed on output model', e);
    }
    return null;
  }

  /**
   * Normalize outputs to compare equality while ignoring transient fields
   * like execution_count and transient metadata.
   */
  // private _normalizeOutputs(outputs: any[] | null): any[] | null {
  //   if (!outputs) {
  //     return null;
  //   }
  //   const normalizeData = (data: any) => {
  //     if (!data || typeof data !== 'object') {
  //       return data;
  //     }
  //     const keys = Object.keys(data).sort();
  //     const norm: any = {};
  //     for (const k of keys) {
  //       norm[k] = data[k];
  //     }
  //     return norm;
  //   };
  //   return outputs.map(o => {
  //     const c: any = { ...o };
  //     delete c.execution_count;
  //     delete c.transient;
  //     if (c.metadata && typeof c.metadata === 'object') {
  //       const m = { ...c.metadata };
  //       delete (m as any).execution;
  //       c.metadata = m;
  //     }
  //     if (c.data) {
  //       c.data = normalizeData(c.data);
  //     }
  //     return c;
  //   });
  // }

  // private _outputsEqual(a: any[] | null, b: any[] | null): boolean {
  //   const na = this._normalizeOutputs(a);
  //   const nb = this._normalizeOutputs(b);
  //   return JSON.stringify(na) === JSON.stringify(nb);
  // }

  /**
   * Apply outputs array to the visible output area model.
   */
  private _applyOutputsToVisibleModel(outputs: any[]): void {
    const model: any = this.content.model as any;
    if (typeof model.fromJSON === 'function') {
      model.fromJSON(outputs);
      return;
    }
    if (typeof model.clear === 'function') {
      model.clear();
    }
    if (Array.isArray(outputs)) {
      for (const out of outputs) {
        if (typeof model.add === 'function') {
          model.add(out);
        }
      }
    }
  }

  /**
   * Highlight specific lines in the associated editor
   * @param lineNumbers Array of line numbers to highlight (1-based)
   * @param className CSS class name for the highlight decoration
   */
  highlightLines(lineNumbers: number[], className: string = 'jp-dyno-highlighted-line'): void {
    console.log(`[DEBUG] highlightLines called with lines:`, lineNumbers, `className:`, className);
    
    if (!this._editorWidget || !this._editorWidget.content || !this._editorWidget.content.editor) {
      console.warn('[DEBUG] Editor not available for highlighting');
      return;
    }

    const editor = this._editorWidget.content.editor;
    
    // Clear existing highlights first
    this.clearHighlights();

    // Store the highlighting info for later reference
    if (!this._persistentHighlights) {
      this._persistentHighlights = new Map();
    }
    
    try {
      // For JupyterLab 4.x with CodeMirror 6, we need to use a different approach
      // Try to get the CodeMirror editor view
      const editorView = (editor as any).editor;
      
      if (editorView && editorView.state && editorView.dispatch) {
        console.log('[DEBUG] Using CodeMirror 6 style highlighting');
        
        // Create line-level decorations using CodeMirror 6 API
        const decorations: any[] = [];
        
        lineNumbers.forEach(lineNum => {
          this._persistentHighlights.set(lineNum, className);
          
          // Convert to 0-based line number
          const lineIndex = lineNum - 1;
          
          if (lineIndex >= 0 && lineIndex < editorView.state.doc.lines) {
            const line = editorView.state.doc.line(lineIndex + 1); // CodeMirror lines are 1-based
            
            // Create a line decoration
            const decoration = {
              from: line.from,
              to: line.to,
              class: className
            };
            
            decorations.push(decoration);
            console.log(`[DEBUG] Created decoration for line ${lineNum}: ${line.from}-${line.to}`);
          }
        });
        
        // Store decorations for later cleanup
        this._highlightMarks = decorations;
        
        // Apply decorations using CSS styling approach since CodeMirror 6 decorations
        // are complex to add dynamically. Instead, we'll add CSS classes to line elements.
        this._applyCSSLineHighlights(lineNumbers, className);
        
      } else {
        console.log('[DEBUG] Fallback: Trying CSS-based highlighting');
        this._applyCSSLineHighlights(lineNumbers, className);
      }
    } catch (error) {
      console.error('[DEBUG] Error in highlightLines:', error);
      // Fallback to CSS-based highlighting
      this._applyCSSLineHighlights(lineNumbers, className);
    }

    console.log(`[DEBUG] Stored ${lineNumbers.length} highlights for lines: ${lineNumbers}`);
  }

  /**
   * Apply highlighting without clearing existing highlights first
   * Used when applying multiple highlight types from MIME data
   * @param lineNumbers Array of line numbers to highlight (1-based)
   * @param className CSS class name for the highlight decoration
   */
  private _applyHighlightingWithoutClear(lineNumbers: number[], className: string): void {
    console.log(`[DEBUG] _applyHighlightingWithoutClear called with lines:`, lineNumbers, `className:`, className);
    
    if (!this._editorWidget || !this._editorWidget.content || !this._editorWidget.content.editor) {
      console.warn('[DEBUG] Editor not available for highlighting');
      return;
    }

    const editor = this._editorWidget.content.editor;

    // Store the highlighting info for later reference
    if (!this._persistentHighlights) {
      this._persistentHighlights = new Map();
    }
    
    try {
      // For JupyterLab 4.x with CodeMirror 6, we need to use a different approach
      // Try to get the CodeMirror editor view
      const editorView = (editor as any).editor;
      
      if (editorView && editorView.state && editorView.dispatch) {
        console.log('[DEBUG] Using CodeMirror 6 style highlighting');
        
        // Create line-level decorations using CodeMirror 6 API
        const decorations: any[] = [];
        
        lineNumbers.forEach(lineNum => {
          this._persistentHighlights.set(lineNum, className);
          
          // Convert to 0-based line number
          const lineIndex = lineNum - 1;
          
          if (lineIndex >= 0 && lineIndex < editorView.state.doc.lines) {
            const line = editorView.state.doc.line(lineIndex + 1); // CodeMirror lines are 1-based
            
            // Create a line decoration
            const decoration = {
              from: line.from,
              to: line.to,
              class: className
            };
            
            decorations.push(decoration);
            console.log(`[DEBUG] Created decoration for line ${lineNum}: ${line.from}-${line.to}`);
          }
        });
        
        // Store decorations for later cleanup
        this._highlightMarks.push(...decorations);
        
        // Apply decorations using CSS styling approach since CodeMirror 6 decorations
        // are complex to add dynamically. Instead, we'll add CSS classes to line elements.
        this._applyCSSLineHighlights(lineNumbers, className);
        
      } else {
        console.log('[DEBUG] Fallback: Trying CSS-based highlighting');
        this._applyCSSLineHighlights(lineNumbers, className);
      }
    } catch (error) {
      console.error('[DEBUG] Error in _applyHighlightingWithoutClear:', error);
      // Fallback to CSS-based highlighting
      this._applyCSSLineHighlights(lineNumbers, className);
    }

    console.log(`[DEBUG] Applied ${lineNumbers.length} highlights for lines: ${lineNumbers}`);
  }

  /**
   * Apply CSS-based line highlighting as a fallback method
   */
  private _applyCSSLineHighlights(lineNumbers: number[], className: string): void {
    try {
      const editor = this._editorWidget?.content?.editor;
      if (!editor) {
        console.warn('[DEBUG] No editor available for CSS highlighting');
        return;
      }

      // Get the editor's DOM element using multiple possible paths
      let editorElement = null;
      
      // Try different ways to get the editor element
      if ((editor as any).host) {
        editorElement = (editor as any).host;
      } else if (this._editorWidget.content && (this._editorWidget.content as any).node) {
        editorElement = (this._editorWidget.content as any).node;
      } else if (this._editorWidget.node) {
        editorElement = this._editorWidget.node;
      }
      
      if (editorElement) {
        console.log('[DEBUG] Found editor element, looking for line elements...');
        
        // Look for different types of line elements that might exist
        const possibleSelectors = [
          '.cm-line',           // CodeMirror 6
          '.CodeMirror-line',   // CodeMirror 5
          '.cm-activeLine',     // CodeMirror active line
          '[role="textbox"] > div', // Generic approach
          '.cm-content > div'   // CodeMirror 6 content
        ];
        
        let lineElements: NodeListOf<Element> | null = null;
        let usedSelector = '';
        
        for (const selector of possibleSelectors) {
          const elements = editorElement.querySelectorAll(selector);
          if (elements.length > 0) {
            lineElements = elements;
            usedSelector = selector;
            console.log(`[DEBUG] Found ${elements.length} line elements using selector "${selector}"`);
            break;
          }
        }
        
        if (lineElements && lineElements.length > 0) {
          console.log(`[DEBUG] Using ${lineElements.length} line elements from selector "${usedSelector}"`);
          
          lineNumbers.forEach(lineNum => {
            const lineIndex = lineNum - 1; // Convert to 0-based
            
            if (lineIndex >= 0 && lineIndex < lineElements.length) {
              const lineElement = lineElements[lineIndex];
              if (lineElement) {
                lineElement.classList.add(className);
                this._highlightMarks.push({
                  element: lineElement,
                  className: className,
                  lineNumber: lineNum
                });
                console.log(`[DEBUG] Applied CSS class ${className} to line ${lineNum} using selector "${usedSelector}"`);
              }
            } else {
              console.warn(`[DEBUG] Line ${lineNum} is out of bounds (max: ${lineElements.length})`);
            }
          });
        } else {
          console.warn('[DEBUG] Could not find any line elements in editor DOM');
          console.log('[DEBUG] Editor element structure:', editorElement.innerHTML.substring(0, 500));
          
          // As a last resort, try to add highlighting by observing the editor
          this._attemptDelayedHighlighting(lineNumbers, className);
        }
      } else {
        console.warn('[DEBUG] Could not find editor DOM element');
        this._attemptDelayedHighlighting(lineNumbers, className);
      }
    } catch (error) {
      console.error('[DEBUG] Error in CSS highlighting:', error);
    }
  }

  /**
   * Attempt delayed highlighting as a last resort
   */
  private _attemptDelayedHighlighting(lineNumbers: number[], className: string): void {
    console.log('[DEBUG] Attempting delayed highlighting...');
    
    let retryCount = 0;
    const maxRetries = 10;
    
    const retryHighlighting = () => {
      retryCount++;
      
      if (retryCount > maxRetries) {
        console.warn('[DEBUG] Max retries reached for delayed highlighting');
        return;
      }
      
      console.log(`[DEBUG] Retry ${retryCount}: Looking for line elements...`);
      
      try {
        const editor = this._editorWidget?.content?.editor;
        if (!editor) {
          setTimeout(retryHighlighting, 500);
          return;
        }

        const editorElement = (editor as any).host || (this._editorWidget.content as any).node || this._editorWidget.node;
        if (!editorElement) {
          setTimeout(retryHighlighting, 500);
          return;
        }

        const lineElements = editorElement.querySelectorAll('.cm-line, .CodeMirror-line');
        if (lineElements.length === 0) {
          setTimeout(retryHighlighting, 500);
          return;
        }

        console.log(`[DEBUG] Retry ${retryCount}: Found ${lineElements.length} line elements`);
        
        // Apply highlighting
        lineNumbers.forEach(lineNum => {
          const lineIndex = lineNum - 1;
          
          if (lineIndex >= 0 && lineIndex < lineElements.length) {
            const lineElement = lineElements[lineIndex];
            if (lineElement) {
              lineElement.classList.add(className);
              this._highlightMarks.push({
                element: lineElement,
                className: className,
                lineNumber: lineNum
              });
              console.log(`[DEBUG] Delayed highlighting applied to line ${lineNum}`);
            }
          }
        });
        
      } catch (error) {
        console.error(`[DEBUG] Error in retry ${retryCount}:`, error);
        setTimeout(retryHighlighting, 500);
      }
    };
    
    // Start the retry process
    setTimeout(retryHighlighting, 500);
  }

  /**
   * Clear all line highlights
   */
  clearHighlights(): void {
    console.log('[DEBUG] Clearing highlights...');
    
    // Clear stored highlight data
    if (this._persistentHighlights) {
      this._persistentHighlights.clear();
    }
    
    // Clear highlight marks
    if (this._highlightMarks && this._highlightMarks.length > 0) {
      this._highlightMarks.forEach(mark => {
        try {
          if (mark && typeof mark.clear === 'function') {
            // CodeMirror style line class handle
            mark.clear();
          } else if (mark && mark.element && mark.className) {
            // CSS-based highlighting - remove the class
            mark.element.classList.remove(mark.className);
            console.log(`[DEBUG] Removed CSS class ${mark.className} from line ${mark.lineNumber}`);
          }
        } catch (error) {
          console.warn('[DEBUG] Error clearing highlight mark:', error);
        }
      });
      this._highlightMarks = [];
    }
    
    // Additional cleanup: remove all our highlight classes from the editor DOM
    const editor = this._editorWidget?.content?.editor;
    if (editor) {
      const editorElement = (editor as any).host || (this._editorWidget.content as any).node;
      
      if (editorElement) {
        const highlightClasses = [
          'jp-dyno-highlighted-line',
          'jp-dyno-error-line', 
          'jp-dyno-warning-line',
          'jp-dyno-success-line'
        ];
        
        // Remove highlight classes from all line elements
        highlightClasses.forEach(className => {
          const highlightedElements = editorElement.querySelectorAll(`.${className}`);
          highlightedElements.forEach((element: Element) => {
            element.classList.remove(className);
          });
        });
        
        console.log('[DEBUG] Cleaned up CSS classes from editor DOM');
      }
    }
    
    console.log('[DEBUG] Cleared all highlights');
  }

  /**
   * Set the reference to the associated editor widget
   */
  setEditorWidget(editorWidget: any): void {
    console.log('[DEBUG] setEditorWidget called with:', editorWidget);
    this._editorWidget = editorWidget;
    
    // Set the correct MIME type for the editor immediately
    this._setEditorMimeType();
    
    // Wait for the editor to be fully loaded
    this._waitForEditorReady().then(() => {
      console.log('[DEBUG] Editor is ready for highlighting');
      
      // Apply syntax highlighting
      this._applySyntaxHighlighting();
      
      // Don't automatically test highlighting - let it be triggered by actual data
    }).catch(error => {
      console.warn('[DEBUG] Error waiting for editor ready:', error);
    });
  }

  /**
   * Force set the language mode via JupyterLab's language registry
   */
  private _forceLanguageMode(filePath: string): void {
    console.log('[DEBUG] Forcing language mode for:', filePath);
    
    try {
      const editor = this._editorWidget.content.editor;
      let languageName = '';
      
      if (filePath.endsWith('.dyno') || filePath.endsWith('.🦖') || filePath.endsWith('.dyno.yaml')) {
        languageName = 'dyno';
      } else if (filePath.endsWith('.mod') || filePath.endsWith('.dynare.mod')) {
        languageName = 'mod';
      }
      
      if (languageName) {
        // Try to get the editor's language support and force set it
        const editorView = (editor as any).editor;
        if (editorView && editorView.state) {
          console.log('[DEBUG] Attempting to force language mode:', languageName);
          
          // Check if the language is already applied
          const currentLang = editorView.state.facet ? 'has facets' : 'no facets';
          console.log('[DEBUG] Current editor language state:', currentLang);
          
          // Try to get language from global registry
          if ((window as any).jupyterlab) {
            const app = (window as any).jupyterlab;
            if (app.serviceManager && app.serviceManager.language) {
              console.log('[DEBUG] Found language service, attempting to set language');
              // This would be the ideal way but may not be available
            }
          }
        }
      }
    } catch (error) {
      console.warn('[DEBUG] Failed to force language mode:', error);
    }
  }

  /**
   * Set the correct MIME type for the editor based on file extension
   */
  private _setEditorMimeType(): void {
    if (!this._editorWidget || !this._editorWidget.content || !this._editorWidget.content.editor) {
      return;
    }

    const filePath = this._editorWidget.context?.path || '';
    let mimeType = '';

    console.log('[DEBUG] Setting MIME type for file:', filePath);

    if (filePath.endsWith('.dyno') || filePath.endsWith('.🦖') || filePath.endsWith('.dyno.yaml')) {
      mimeType = 'text/x-dyno';
    } else if (filePath.endsWith('.mod') || filePath.endsWith('.dynare.mod')) {
      mimeType = 'text/x-mod';
    }

    if (mimeType) {
      try {
        const editor = this._editorWidget.content.editor;
        console.log('[DEBUG] Setting editor MIME type to:', mimeType);
        
        // For JupyterLab 4.x, try to set the mode directly
        if ((editor as any).setOption) {
          (editor as any).setOption('mode', mimeType);
        } else if ((editor as any).model && (editor as any).model.mimeType) {
          (editor as any).model.mimeType = mimeType;
        }
        
        // Also try to set it via the document model
        if (this._editorWidget.context && this._editorWidget.context.model) {
          (this._editorWidget.context.model as any).mimeType = mimeType;
        }
        
        console.log('[DEBUG] Editor MIME type set successfully');
      } catch (error) {
        console.warn('[DEBUG] Failed to set editor MIME type:', error);
      }
    }
  }

  /**
   * Apply syntax highlighting to the editor
   */
  private _applySyntaxHighlighting(): void {
    if (!this._editorWidget || !this._editorWidget.content || !this._editorWidget.content.editor) {
      console.warn('[DEBUG] No editor available for syntax highlighting');
      return;
    }

    try {
      const editor = this._editorWidget.content.editor;
      const filePath = this._editorWidget.context?.path || '';
      
      console.log('[DEBUG] Applying syntax highlighting for file:', filePath);
      
      // First, try to force set the language via JupyterLab's language registry
      this._forceLanguageMode(filePath);
      
      // Determine which language mode to use based on file extension
      let languageMode = null;
      if (filePath.endsWith('.dyno') || filePath.endsWith('.🦖') || filePath.endsWith('.dyno.yaml')) {
        languageMode = dyno();
        console.log('[DEBUG] Using DYNO language mode');
      } else if (filePath.endsWith('.mod') || filePath.endsWith('.dynare.mod')) {
        languageMode = mod();
        console.log('[DEBUG] Using MOD language mode');
      }
      
      if (languageMode) {
        // Try multiple approaches to apply the language mode
        const editorView = (editor as any).editor;
        console.log('[DEBUG] Editor view:', editorView);
        
        if (editorView && editorView.state && editorView.dispatch) {
          console.log('[DEBUG] Attempting to apply language mode via CodeMirror 6 API');
          
          try {
            // Approach 1: Try direct language reconfiguration
            import('@codemirror/state').then(({ Compartment, StateEffect }) => {
              console.log('[DEBUG] Loaded CodeMirror state module');
              
              if (!this._languageCompartment) {
                this._languageCompartment = new Compartment();
                
                // Apply initial configuration
                const transaction = editorView.state.update({
                  effects: this._languageCompartment.reconfigure(languageMode)
                });
                editorView.dispatch(transaction);
                console.log('[DEBUG] Language mode applied with new compartment');
              } else {
                // Reconfigure existing
                const transaction = editorView.state.update({
                  effects: this._languageCompartment.reconfigure(languageMode)
                });
                editorView.dispatch(transaction);
                console.log('[DEBUG] Language mode reconfigured');
              }
            }).catch(error => {
              console.error('[DEBUG] Error with Compartment approach:', error);
              
              // Approach 2: Try extension approach
              try {
                const newExtensions = [languageMode];
                const transaction = editorView.state.update({
                  effects: { reconfigure: newExtensions }
                });
                editorView.dispatch(transaction);
                console.log('[DEBUG] Language mode applied via extension reconfiguration');
              } catch (extError) {
                console.error('[DEBUG] Extension approach failed:', extError);
                
                // Approach 3: Try replacing the entire configuration
                this._tryAdvancedLanguageApplication(editorView, languageMode, filePath);
              }
            });
          } catch (mainError) {
            console.error('[DEBUG] Main language application failed:', mainError);
            this._tryAdvancedLanguageApplication(editorView, languageMode, filePath);
          }
        } else {
          console.warn('[DEBUG] Could not access CodeMirror editor view');
          this._trySimpleSyntaxHighlighting(filePath);
        }
      } else {
        console.log('[DEBUG] No language mode needed for file:', filePath);
      }
    } catch (error) {
      console.error('[DEBUG] Error applying syntax highlighting:', error);
    }
  }

  /**
   * Try advanced language application techniques
   */
  private _tryAdvancedLanguageApplication(editorView: any, languageMode: any, filePath: string): void {
    console.log('[DEBUG] Trying advanced language application');
    
    try {
      // Try getting the current document and creating a new state
      const currentDoc = editorView.state.doc;
      
      import('@codemirror/state').then(({ EditorState }) => {
        const newState = EditorState.create({
          doc: currentDoc,
          extensions: [languageMode]
        });
        
        // Replace the entire state
        editorView.setState(newState);
        console.log('[DEBUG] Applied language mode by replacing editor state');
      }).catch(error => {
        console.error('[DEBUG] Advanced application failed:', error);
        this._trySimpleSyntaxHighlighting(filePath);
      });
    } catch (error) {
      console.error('[DEBUG] Advanced language application error:', error);
      this._trySimpleSyntaxHighlighting(filePath);
    }
  }

  /**
   * Fallback to simple CSS-based syntax highlighting
   */
  private _trySimpleSyntaxHighlighting(filePath: string): void {
    console.log('[DEBUG] Falling back to simple syntax highlighting for:', filePath);
    
    setTimeout(() => {
      try {
        const editorElement = this._editorWidget?.content?.node;
        if (editorElement) {
          const lines = editorElement.querySelectorAll('.cm-line, .CodeMirror-line');
          console.log(`[DEBUG] Found ${lines.length} lines for CSS highlighting`);
          
          // Apply simple regex-based highlighting
          lines.forEach((line: Element, index: number) => {
            const htmlLine = line as HTMLElement;
            let content = htmlLine.textContent || '';
            
            if (content.trim()) {
              // Apply basic highlighting patterns
              if (filePath.endsWith('.dyno') || filePath.endsWith('.🦖') || filePath.endsWith('.dyno.yaml')) {
                content = this._applyDynoHighlighting(content);
              } else if (filePath.endsWith('.mod') || filePath.endsWith('.dynare.mod')) {
                content = this._applyModHighlighting(content);
              }
              
              if (content !== htmlLine.textContent) {
                htmlLine.innerHTML = content;
                console.log(`[DEBUG] Applied CSS highlighting to line ${index + 1}`);
              }
            }
          });
        }
      } catch (error) {
        console.error('[DEBUG] Simple syntax highlighting failed:', error);
      }
    }, 500);
  }

  /**
   * Apply DYNO-specific highlighting patterns
   */
  private _applyDynoHighlighting(content: string): string {
    return content
      .replace(/\b(var|varexo|parameters|model|steady_state_model|shocks|end)\b/g, '<span class="cm-keyword">$1</span>')
      .replace(/\b(log|exp|sin|cos|tan|sqrt|abs|max|min)\b/g, '<span class="cm-builtin">$1</span>')
      .replace(/#.*$/gm, '<span class="cm-comment">$&</span>')
      .replace(/\b\d*\.?\d+([eE][+-]?\d+)?\b/g, '<span class="cm-number">$&</span>')
      .replace(/<-/g, '<span class="cm-operator">$&</span>');
  }

  /**
   * Apply MOD-specific highlighting patterns
   */
  private _applyModHighlighting(content: string): string {
    return content
      .replace(/\b(var|varexo|parameters|model|end|initval|steady|stoch_simul)\b/g, '<span class="cm-keyword">$1</span>')
      .replace(/\b(log|exp|sin|cos|tan|sqrt|abs|max|min)\b/g, '<span class="cm-builtin">$1</span>')
      .replace(/\/\/.*$/gm, '<span class="cm-comment">$&</span>')
      .replace(/\/\*[\s\S]*?\*\//g, '<span class="cm-comment">$&</span>')
      .replace(/\b\d*\.?\d+([eE][+-]?\d+)?\b/g, '<span class="cm-number">$&</span>')
      .replace(/=/g, '<span class="cm-operator">$&</span>');
  }

  /**
   * Test highlighting functionality - can be called manually for debugging
   */
  testHighlighting(): void {
    console.log('[DEBUG] === TESTING HIGHLIGHTING ===');
    
    try {
      // Test different highlight styles
      console.log('[DEBUG] Testing default highlighting on lines 1-2');
      this.highlightLines([1, 2], 'jp-dyno-highlighted-line');
      
      // Test with a delay for error highlighting
      setTimeout(() => {
        console.log('[DEBUG] Testing error highlighting on line 3');
        this.highlightLines([3], 'jp-dyno-error-line');
      }, 2000);
      
      // Test with another delay for warning highlighting
      setTimeout(() => {
        console.log('[DEBUG] Testing warning highlighting on line 4');
        this.highlightLines([4], 'jp-dyno-warning-line');
      }, 4000);
      
    } catch (error) {
      console.error('[DEBUG] Error in testHighlighting:', error);
    }
  }

  /**
   * Wait for the editor to be fully ready
   */
  private async _waitForEditorReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkEditor = () => {
        if (this._editorWidget && 
            this._editorWidget.content && 
            this._editorWidget.content.editor && 
            this._editorWidget.content.editor.host) {
          
          const editorElement = this._editorWidget.content.editor.host;
          const lineElements = editorElement.querySelectorAll('.cm-line, .CodeMirror-line');
          
          if (lineElements.length > 0) {
            console.log('[DEBUG] Editor is ready with', lineElements.length, 'lines');
            resolve();
            return;
          }
        }
        
        // If not ready, check again after a short delay
        setTimeout(checkEditor, 100);
      };
      
      checkEditor();
      
      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Editor ready timeout'));
      }, 10000);
    });
  }

  /**
   * Perform highlighting based on rendering results
   * First checks for custom MIME type data, then falls back to content analysis
   */
  private _performHighlightingBasedOnResults(outputs: any[]): void {
    console.log('[DEBUG] _performHighlightingBasedOnResults called with outputs:', outputs);
    console.log('[DEBUG] Outputs count:', outputs.length);
    
    // First, check for our custom MIME type in the outputs
    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];
      console.log(`[DEBUG] Output ${i}:`, output);
      console.log(`[DEBUG] Output ${i} type:`, output.output_type);
      
      if (output.output_type === 'display_data' && output.data) {
        console.log(`[DEBUG] Output ${i} data keys:`, Object.keys(output.data));
        
        // Check for our custom MIME type
        const mimeType = 'application/vnd.jupyterlab-dyno.highlighting+json';
        
        if (mimeType in output.data) {
          const highlightData = output.data[mimeType];
          console.log('[DEBUG] *** FOUND HIGHLIGHTING MIME DATA ***:', highlightData);
          
          // Handle array of highlight objects (new format)
          if (Array.isArray(highlightData)) {
            console.log('[DEBUG] *** PROCESSING ARRAY OF HIGHLIGHT OBJECTS ***');
            
            // Clear existing highlights first
            this.clearHighlights();
            
            // Group lines by type for efficient highlighting
            const linesByType = new Map<string, number[]>();
            
            highlightData.forEach(item => {
              if (item.line && item.type) {
                const type = item.type;
                if (!linesByType.has(type)) {
                  linesByType.set(type, []);
                }
                linesByType.get(type)!.push(item.line);
                console.log(`[DEBUG] Added line ${item.line} with type ${type}, message: ${item.message || 'none'}`);
              }
            });
            
            // Apply highlighting for each type with increasing delays to avoid clearing each other
            let delay = 200;
            linesByType.forEach((lines, type) => {
              const className = this._getHighlightClassName(type);
              console.log(`[DEBUG] *** APPLYING HIGHLIGHTING ***: type=${type}, lines=${lines}, className=${className}`);
              
              // Apply highlighting with a delay to ensure DOM is ready
              // Use a separate delay for each type and don't call clearHighlights in highlightLines
              setTimeout(() => {
                this._applyHighlightingWithoutClear(lines, className);
              }, delay);
              delay += 50; // Stagger the highlighting calls
            });
            
            return; // Found and applied highlighting, exit early
          }
        }
      }
    }
    
    console.log('[DEBUG] No MIME highlighting data found. No fallback highlighting will be applied.');
    console.log('[DEBUG] Highlighting check completed - only MIME type highlighting is active.');
  }



  // Dispose of resources held by the widget
  dispose(): void {
    // Clear any line highlights
    this.clearHighlights();
    
    // Clean up comm targets
    this._cleanupComm();
    
    // Disconnect activity monitor first
    if (this._monitor) {
      this._monitor.dispose();
      this._monitor = null;
    }
    
    this.content.dispose();
    
    // Aggressively shutdown kernel and session
    if (this._sessionContext && !this._sessionContext.isDisposed) {
      const session = this._sessionContext.session;
      if (session && session.kernel) {
        console.log('Shutting down kernel:', session.kernel.id);
        // First try to shutdown the kernel directly
        session.kernel.shutdown().then(() => {
          console.log('Kernel shutdown completed');
        }).catch(err => {
          console.warn('Error shutting down kernel directly:', err);
        }).finally(() => {
          // Then shutdown the session
          this._sessionContext.shutdown().catch(err => {
            console.warn('Error shutting down session context:', err);
          });
        });
      } else {
        // No kernel, just shutdown the session context
        this._sessionContext.shutdown().catch(err => {
          console.warn('Error shutting down session context:', err);
        });
      }
    }
    
    super.dispose();
  }
  private _renderPending = false;
  private _sessionContext: SessionContext;
  private _monitor: ActivityMonitor<DocumentRegistry.IModel, void> | null =
    null;
  private _rendermime: IRenderMimeRegistry;
  private _isFirstRender = true;
  /**
   * Clean up comm targets when disposing
   */
  private _cleanupComm(): void {
    if (this._sessionContext?.session?.kernel) {
      try {
        // Note: removeCommTarget may not exist or may have different signature
        const kernel = this._sessionContext.session.kernel;
        if (typeof (kernel as any).removeCommTarget === 'function') {
          (kernel as any).removeCommTarget('jupyterlab-dyno-highlighting', () => {});
        }
        console.log('[DEBUG] Comm target cleaned up');
      } catch (e) {
        // Ignore if target doesn't exist or method signature is different
      }
    }
  }

  private _editorWidget: any = null; // Reference to the associated editor widget
  private _highlightMarks: any[] = []; // Store highlight marks for cleanup
  private _persistentHighlights: Map<number, string> = new Map(); // Store persistent highlight info
  private _languageCompartment: any = null; // CodeMirror language compartment
}

/**
 * DynareWidgetFactory: a widget factory to create new instances of DynareWidget
 */
export class DynareWidgetFactory extends ABCWidgetFactory<
  DynareWidget,
  DocumentModel
> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions,
    rendermime: IRenderMimeRegistry,
    servicemanager: ServiceManager.IManager
  ) {
    super(options);
    this._rendermime = rendermime;
    this._servicemanager = servicemanager;
  }

  /**
   * Create new DynareWidget given a context (file info)
   */
  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentModel>
  ): DynareWidget {
    // Create a dedicated OutputAreaModel per widget to avoid shared state
    const model = new OutputAreaModel({ trusted: true });
    return new DynareWidget(
      {
        context,
        content: new SimplifiedOutputArea({
          model,
          rendermime: this._rendermime
        })
      },
  this._servicemanager,
  this._rendermime
    );
  }
  private _rendermime: IRenderMimeRegistry;
  private _servicemanager: ServiceManager.IManager;
}
/*
 * Export token
 */
export const IDynareTracker = new Token<IWidgetTracker<DynareWidget>>(
  'dynare-tracker'
);

const FACTORY = 'Dyno extension';

/**
 * Initialization data for the jupyterlab-dyno extension.
 */
const plugin: JupyterFrontEndPlugin<IWidgetTracker<DynareWidget>> = {
  id: PLUGIN_ID,
  description: 'A JupyterLab extension for solving DSGE models',
  autoStart: true,
  provides: IDynareTracker,
  requires: [ILayoutRestorer, IRenderMimeRegistry, ISettingRegistry, IEditorLanguageRegistry],
  optional: [],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    rendermime: IRenderMimeRegistry,
    settings: ISettingRegistry,
    editorLanguages: IEditorLanguageRegistry
  ): IWidgetTracker<DynareWidget> => {
    console.log('JupyterLab extension jupyterlab-dyno is activated!');
    
    // Start the simple syntax highlighting monitor as a fallback
    startSyntaxHighlightingMonitor();
    
    // Register syntax highlighting for our custom languages with JupyterLab's editor system
    console.log('Registering DYNO and MOD language modes with editor language registry...');
    
    try {
      // Register DYNO language mode
      editorLanguages.addLanguage({
        name: 'dyno',
        mime: 'text/x-dyno',
        load: async () => {
          console.log('[DEBUG] Loading DYNO language mode');
          return dyno();
        }
      });

      // Register MOD language mode  
      editorLanguages.addLanguage({
        name: 'mod',
        mime: 'text/x-mod',
        load: async () => {
          console.log('[DEBUG] Loading MOD language mode');
          return mod();
        }
      });

      // Also register for the existing MIME type used by the extension
      editorLanguages.addLanguage({
        name: 'dyno-alt',
        mime: 'text/mod', // This is your existing MIME type
        load: async () => {
          console.log('[DEBUG] Loading DYNO language mode for text/mod MIME type');
          return dyno();
        }
      });
      
      console.log('Language modes registered successfully');
    } catch (error) {
      console.error('Error registering language modes:', error);
    }
    
    const { commands, shell } = app;
    // Tracker
    const namespace = 'jupyterlab-dyno';
    const tracker = new WidgetTracker<DynareWidget>({ namespace });
    const servicemanager = app.serviceManager;
    // Track split state
    let splitDone = false;
    let leftEditorRefId: string | null = null;
    let rightViewerRefId: string | null = null;

    // State restoration: reopen document if it was open previously
    if (restorer) {
      restorer.restore(tracker, {
        command: 'docmanager:open',
        args: widget => ({ path: widget.context.path, factory: FACTORY }),
        name: widget => {
          console.debug('[Restorer]: Re-opening', widget.context.path);
          return widget.context.path;
        }
      });
    }

    // Create widget factory so that manager knows about widget
    const widgetFactory = new DynareWidgetFactory(
      {
        name: FACTORY,
        fileTypes: ['mod', 'dyno', 'dynoYAML'],
        defaultFor: ['mod','dynare.mod', 'dyno', 'dynoYAML']
      },
      rendermime,
      servicemanager
    );

    // Add widget to tracker when created
    widgetFactory.widgetCreated.connect(async (sender, widget) => {
      // Make the widget globally accessible for debugging
      (window as any).currentDynoWidget = widget;
      console.log('[DEBUG] Widget is now accessible as window.currentDynoWidget');
      
      // Notify instance tracker if restore data needs to be updated
      widget.context.pathChanged.connect(() => {
        tracker.save(widget);
      });
      tracker.add(widget);

      // Reset split state when all widgets are closed
      widget.disposed.connect(() => {
        if (tracker.size === 0) {
          splitDone = false;
          leftEditorRefId = null;
          rightViewerRefId = null;
        }
      });

      // Split layout on first open, then tab into panels
      if (!splitDone) {
        const editor = await commands.execute('docmanager:open', {
          path: widget.context.path,
          factory: 'Editor',
          options: { mode: 'split-left', ref: widget.id }
        });
        splitDone = true;
        leftEditorRefId = editor.id;
        rightViewerRefId = widget.id;
        
        // Store editor reference in the widget for highlighting
        widget.setEditorWidget(editor);
      } else {
        if (rightViewerRefId) {
          shell.add(widget, 'main', {
            mode: 'tab-after',
            ref: rightViewerRefId
          });
        }
        if (leftEditorRefId) {
          const editor = await commands.execute('docmanager:open', {
            path: widget.context.path,
            factory: 'Editor',
            options: { mode: 'tab-after', ref: leftEditorRefId }
          });
          
          // Store editor reference in the widget for highlighting
          widget.setEditorWidget(editor);
        }
      }

      /**
       * Load the settings for this extension
       *
       * @param setting Extension settings
       */
      function loadSetting(setting: ISettingRegistry.ISettings): void {
        global_setting = setting.composite as any;
        preserveScrollPosition = (setting.get('preserve-scroll-position')
          .composite as boolean) ?? true;
        console.log('Settings loaded:', { 
          preserveScrollPosition, 
          global_setting 
        });
      }

      /**
       * Wait for settings to be loaded and display them in console
       */
      settings.load(PLUGIN_ID).then(setting => {
        // Read the settings
        loadSetting(setting);

        // Listen for setting changes using Signal
        setting.changed.connect(loadSetting);
      });
    });

    // Register widget and model factories
    app.docRegistry.addWidgetFactory(widgetFactory);

    // Register file types with proper MIME types for syntax highlighting
    app.docRegistry.addFileType({
      name: 'mod',
      displayName: 'Mod',
      extensions: ['.mod', '.dynare.mod'],
      fileFormat: 'text',
      contentType: 'file',
      mimeTypes: ['text/x-mod', MIME_TYPE]
    });
    app.docRegistry.addFileType({
      name: 'dyno',
      displayName: 'Dyno',
      extensions: ['.dyno', '.🦖'],
      fileFormat: 'text',
      contentType: 'file',
      mimeTypes: ['text/x-dyno', MIME_TYPE]
    });
    app.docRegistry.addFileType({
      name: 'dynoYAML',
      displayName: 'Dyno YAML',
      extensions: ['.dyno.yaml'],
        fileFormat: 'text',
        contentType: 'file',
        mimeTypes: ['text/x-dyno', MIME_TYPE]
    });
    
    return tracker;
  }    
};

export default plugin;
