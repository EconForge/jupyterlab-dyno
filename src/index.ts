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
import { DynoOptionsPanel, IDynoFileOptions } from './sidebar';
import { ToolbarButton } from '@jupyterlab/apputils';

// Default settings, see schema/plugin.json for more details
let global_setting = {};
let preserveScrollPosition = true;
// Exported registry for per-file options (populated in activate)
const dynoFileOptionsRegistry: Map<string, any> = new Map();

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
        display: flex;P
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
  // Merge global settings with per-file options if any
  const perFile = dynoFileOptionsRegistry.get(this.context.path) || {};
  const merged = { ...global_setting, ...perFile };
    // Choose kernel code based on file type
  const code = `import warnings
import json
options = json.loads("""${JSON.stringify(merged)}""")
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

  // Dispose of resources held by the widget
  dispose(): void {
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
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'A JupyterLab extension for solving DSGE models',
  autoStart: true,
  requires: [ILayoutRestorer, IRenderMimeRegistry, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    rendermime: IRenderMimeRegistry,
    settings: ISettingRegistry
  ) => {
    console.log('JupyterLab extension jupyterlab-dyno is activated!');
    const { commands, shell } = app;
    // Tracker
    const namespace = 'jupyterlab-dyno';
    const tracker = new WidgetTracker<DynareWidget>({ namespace });
    const servicemanager = app.serviceManager;
    // Sidebar panel for per-file options
  const optionsPanel = new DynoOptionsPanel();
  // Map path -> options (reuse global registry for render access)
  const fileOptions = dynoFileOptionsRegistry as Map<string, IDynoFileOptions>;
  // Place options panel on the right side instead of left
  shell.add(optionsPanel, 'right', { rank: 800 });
    optionsPanel.changed.connect((sender, opts) => {
      const current = tracker.currentWidget;
      if (current) {
        fileOptions.set(current.context.path, opts);
        // Trigger rerender with new options
        current.update();
      }
    });
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
      // Notify instance tracker if restore data needs to be updated
      widget.context.pathChanged.connect(() => {
        tracker.save(widget);
      });
      tracker.add(widget);
      // Add toolbar buttons
      const rerunButton = new ToolbarButton({
        label: 'Re-run',
        tooltip: 'Re-run Dyno Report',
        onClick: () => {
          widget.update();
        }
      });
      const clearButton = new ToolbarButton({
        label: 'Clear',
        tooltip: 'Clear output',
        onClick: () => {
          widget.content.model.clear();
        }
      });
      const optionsButton = new ToolbarButton({
        label: 'Options',
        tooltip: 'Reveal Dyno Options sidebar',
        onClick: () => {
          // Activate or add to right area
          const area = app.shell;
          area.activateById(optionsPanel.id);
        }
      });
      widget.toolbar.insertItem(0, 'rerun', rerunButton);
      widget.toolbar.insertItem(1, 'clear', clearButton);
      widget.toolbar.insertItem(2, 'options', optionsButton);
      // When switching current widget update panel values
      tracker.currentChanged.connect(() => {
        const current = tracker.currentWidget;
        if (current) {
          const opts = fileOptions.get(current.context.path);
          optionsPanel.setOptions(opts);
        }
      });

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
      } else {
        if (rightViewerRefId) {
          shell.add(widget, 'main', {
            mode: 'tab-after',
            ref: rightViewerRefId
          });
        }
        if (leftEditorRefId) {
          await commands.execute('docmanager:open', {
            path: widget.context.path,
            factory: 'Editor',
            options: { mode: 'tab-after', ref: leftEditorRefId }
          });
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
        console.log(global_setting);
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

    // Register file type
    app.docRegistry.addFileType({
      name: 'mod',
      displayName: 'Mod',
      extensions: ['.mod', '.dynare.mod'],
      fileFormat: 'text',
      contentType: 'file',
      mimeTypes: [MIME_TYPE]
    });
    app.docRegistry.addFileType({
      name: 'dyno',
      displayName: 'Dyno',
      extensions: ['.dyno', '.🦖'],
      fileFormat: 'text',
      contentType: 'file',
      mimeTypes: [MIME_TYPE]
    });
    app.docRegistry.addFileType({
      name: 'dynoYAML',
      displayName: 'Dyno YAML',
      extensions: ['.dyno.yaml'],
        fileFormat: 'text',
        contentType: 'file',
        mimeTypes: [MIME_TYPE]
    });
  }    
};

export default plugin;
