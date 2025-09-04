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
let blanchardKahn = false;
let derivOrder = 1;
let paramDerivOrder = 0;

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
    const start = performance.now();
    const code = `%xmode Minimal\nimport warnings\nwarnings.filterwarnings('ignore')\nfrom dyno.modfile import Modfile\nm=Modfile(txt='''${data}''')\nm.solve()`;
    OutputArea.execute(code, this.content, this._sessionContext)
      .then((msg: KernelMessage.IExecuteReplyMsg | undefined) => {
        const end = performance.now();
        console.log(msg);
        console.log(`Took ${end - start} milliseconds to render mod file`);
      })
      .catch(reason => {
        const end = performance.now();
        console.error(reason);
        console.log(`Took ${end - start} milliseconds to show error message`);
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
    this._outputareamodel = new OutputAreaModel({ trusted: true });
    this._rendermime = rendermime;
    this._servicemanager = servicemanager;
  }

  /**
   * Create new DynareWidget given a context (file info)
   */
  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentModel>
  ): DynareWidget {
    return new DynareWidget(
      {
        context,
        content: new SimplifiedOutputArea({
          model: this._outputareamodel,
          rendermime: this._rendermime
        })
      },
      this._servicemanager
    );
  }
  private _outputareamodel: OutputAreaModel;
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
        fileTypes: ['mod'],
        defaultFor: ['mod']
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
        simulationHorizon = setting.get('simulation-horizon')
          .composite as number;
        blanchardKahn = setting.get('blanchard-kahn').composite as boolean;
        derivOrder = setting.get('deriv-order').composite as number;
        paramDerivOrder = setting.get('param-deriv-order').composite as number;
        console.log(`Simulation horizon = ${simulationHorizon}`);
        console.log(`Blanchard Kahn = ${blanchardKahn}`);
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
      extensions: ['.mod', '.mod'],
      fileFormat: 'text',
      contentType: 'file',
      mimeTypes: [MIME_TYPE]
    });
  }
};

export default plugin;
