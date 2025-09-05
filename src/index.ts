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

// Default settings, see schema/plugin.json for more details
let simulationHorizon = 40;
let derivOrder = 1;
let paramDerivOrder = 0;
let modfilePreprocessor = 'lark';
let global_setting = {};

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'text/mod';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'jupyter-dsge';

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
 * package name: "jupyter-dsge" needs to be the same as package.json
 * settings name: "plugin" needs to be the file name in schema/ that describes extension settings (here plugin.json)
 */
const PLUGIN_ID = 'jupyter-dsge:plugin';

/**
 * DynareWidget: widget that represents the solution of a mod file
 */
export class DynareWidget
  extends DocumentWidget<SimplifiedOutputArea, DocumentModel>
  implements IDocumentWidget<SimplifiedOutputArea, DocumentModel>
{
  constructor(
    options: DocumentWidget.IOptions<SimplifiedOutputArea, DocumentModel>,
    servicemanager: ServiceManager.IManager
  ) {
    super(options);
    this.addClass(CLASS_NAME);
    this._sessionContext = new SessionContext({
      sessionManager: servicemanager.sessions,
      specsManager: servicemanager.kernelspecs,
      name: 'Kernel Output',
      kernelPreference: {
        name: 'xpython'
      }
    });
    this._sessionContext.startKernel().then(res => {
      console.log(res);
      void this.context.ready.then(() => {
        this.update();
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
  }

  protected onUpdateRequest(): void {
    if (this._renderPending) {
      return;
    }
    this._renderPending = true;
    void this._renderModel().then(() => (this._renderPending = false));
  }

  /*
   * Puts solution or error into widget's node
   */
  private async _renderModel(): Promise<void> {
    const data = this.context.model.toString();
    if (data === '') {
      return; // don't try to render empty documents
    }
    // Use the document path to branch behavior by file type
    const path = this.context.path.toLowerCase();
    
    const isDyno = path.endsWith('.dyno') || path.endsWith('.🦖');
    const isDynoYAML = path.endsWith('.dyno.yaml');
    const isMod = path.endsWith('.mod') || path.endsWith('.dynare.mod');
    // define the engine type (either 'dyno','mod' or 'dynoYAML')
    const engine = isDyno ? 'dyno' : isDynoYAML ? 'dynoYAML' : isMod ? 'dynare' : 'unknown';
    const start = performance.now();

    console.log(global_setting);
    // Choose kernel code based on file type
    const code = `import warnings
options = ${JSON.stringify(global_setting)}
warnings.filterwarnings('ignore')
options = {
    'simulation_horizon': ${simulationHorizon},
    'deriv_order': ${derivOrder},
    'param_deriv_order': ${paramDerivOrder},
    'modfile_preprocessor': '${modfilePreprocessor}'
}
from dyno.report import dsge_report
engine = '${engine}'
filename = '${path}'
txt = '''${data}'''
dsge_report(txt=txt, filename=filename, **options)`;

    OutputArea.execute(code, this.content, this._sessionContext)
      .then((msg: KernelMessage.IExecuteReplyMsg | undefined) => {
        const end = performance.now();
        console.log(msg);
    const kind = isDyno ? 'dyno' : isMod ? 'mod' : 'unknown';
    console.log(`Took ${end - start} milliseconds to render ${kind} file`);
      })
      .catch(reason => {
        const end = performance.now();
        console.error(reason);
    const kind = isDyno ? 'dyno' : isMod ? 'mod' : 'unknown';
    console.log(`Took ${end - start} milliseconds to show error message for ${kind} file`);
      });
  }

  // Dispose of resources held by the widget
  dispose(): void {
    this.content.dispose();
    this._sessionContext.dispose();
    super.dispose();
  }
  private _renderPending = false;
  private _sessionContext: SessionContext;
  private _monitor: ActivityMonitor<DocumentRegistry.IModel, void> | null =
    null;
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
      this._servicemanager
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

const FACTORY = 'DSGE extension';

/**
 * Initialization data for the jupyter-dsge extension.
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
    console.log('JupyterLab extension jupyter-dsge is activated!');
    const { commands, shell } = app;
    // Tracker
    const namespace = 'jupyter-dsge';
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
        modfilePreprocessor = setting.get('modfile-preprocessor').composite as string;
        simulationHorizon = setting.get('simulation-horizon')
          .composite as number;
        derivOrder = setting.get('deriv-order').composite as number;
        paramDerivOrder = setting.get('param-deriv-order').composite as number;
        // global_setting = setting.toJSON();
        global_setting = setting.composite as any;
        console.log(global_setting);
        console.log(`Simulation horizon = ${simulationHorizon}`);
        console.log(`Derivation order = ${derivOrder}`);
        console.log(`Parameter derivation order = ${paramDerivOrder}`);
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
