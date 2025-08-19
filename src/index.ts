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

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'text/mod';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'dynare-extension';

/**
 * Timeout between modification and render in milliseconds
 */
const RENDER_TIMEOUT = 10;

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
        name: 'prod'
      }
    });
    this._sessionContext.startKernel().then(res => {
      console.log(res);
      void this.context.ready.then(() => {
        console.log('update called from ctor');
        this.update();
        this._monitor = new ActivityMonitor({
          signal: this.context.model.contentChanged,
          timeout: RENDER_TIMEOUT
        });
        this._monitor.activityStopped.connect(this.update, this);
      });
    });
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
    const code = `from dyno.modfile import Modfile\nm=Modfile(txt='''${data}''')\nm.solve()`;
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

const FACTORY = 'Dynare Extension';

/**
 * Initialization data for the jupyter-dynare extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-dynare:plugin',
  description: 'A JupyterLab extension for solving Dynare models',
  autoStart: true,
  requires: [ILayoutRestorer, IRenderMimeRegistry],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    rendermime: IRenderMimeRegistry
  ) => {
    console.log('JupyterLab extension jupyter-dynare is activated!');
    const { commands, shell } = app;
    // Tracker
    const namespace = 'jupyterlab-dynare';
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
