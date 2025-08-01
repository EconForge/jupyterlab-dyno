import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  DocumentModel
} from '@jupyterlab/docregistry';

import { IWidgetTracker, WidgetTracker } from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';

import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';

import { Widget } from '@lumino/widgets';
import { Token } from '@lumino/coreutils';

import { KernelManager, Kernel } from '@jupyterlab/services';

import { IMimeBundle } from '@jupyterlab/nbformat';

// import { DocumentManager } from '@jupyterlab/docmanager';

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
 * A widget for rendering mod file solutions.
 */
export class SolutionWidget extends Widget {
  /**
   * Construct a new solution widget.
   */
  constructor(context: DocumentRegistry.IContext<DocumentModel>) {
    super();
    this.addClass(CLASS_NAME);
    const manager = new KernelManager();
    this.connection = manager.startNew({ name: 'prod' });
    // const docmanager = new DocumentManager({});
    const data = context.model;
    console.log(data);
    this.renderSolution(data.toString());
  }

  /**
   * Render mod file into this widget's node.
   */
  renderSolution(data: string): Promise<void> {
    console.log('renderSolution was called');
    const start = performance.now();
    this.node.style.setProperty('overflow', 'auto');
    this.addClass('rendered_html');
    const code_content = `from dyno.modfile import Modfile\nm=Modfile(txt='''${data}''')\nm.solve()`;
    // let code_content = `from time import time\nt0 = time()\nfrom dyno.modfile import Modfile\nt1 = time()\nm=Modfile(txt='''${data}''')\nt2 = time()\ns=m.solve()\nt3 = time()\nhtml = s._repr_html_()\nt4 = time()\nprint(f'Module import: {(t1-t0)*1000} ms\\nModel construction: {(t2-t1)*1000} ms\\nModel solving: {(t3-t2)*1000} ms\\nConversion to html: {(t4-t3)*1000} ms\\n->Python total: {(t4-t0)*1000} ms')\nhtml`;
    this.connection.then(conn => {
      const future = conn.requestExecute({ code: code_content });
      future.onIOPub = msg => {
        const end = performance.now();
        // console.log(msg);
        if (msg.header.msg_type === 'execute_result' && 'data' in msg.content) {
          const result = msg.content.data as IMimeBundle;
          this.node.innerHTML = result['text/html'] as string;
          console.log(`Took ${end - start} milliseconds to render mod file`);
        } else if (
          msg.header.msg_type === 'error' &&
          'ename' in msg.content &&
          'evalue' in msg.content
        ) {
          this.node.innerHTML = `<div class="output_stderr"><span class="ansi-red-intense-fg">Failed to solve mod file </span>
          <br> <span class="ansi-red-intense-fg"> ${msg.content.ename}: </span> ${msg.content.evalue} </div>`;
          console.log(`Took ${end - start} milliseconds to show error message`);
        } else if (msg.header.msg_type === 'stream' && 'text' in msg.content) {
          console.log(msg.content.text);
        }
      };
    });
    return Promise.resolve();
  }
  private connection: Promise<Kernel.IKernelConnection>;
}

/**
 * DynareWidget: widget that represents the view for a mod file
 */
export class DynareWidget extends DocumentWidget<
  SolutionWidget,
  DocumentModel
> {
  constructor(options: DocumentWidget.IOptions<SolutionWidget, DocumentModel>) {
    super(options);
  }

  // Dispose of resources held by the widget
  dispose(): void {
    this.content.dispose();
    super.dispose();
  }
}

/**
 * DynareWidgetFactory: a widget factory to create new instances of DynareWidget
 */
export class DynareWidgetFactory extends ABCWidgetFactory<
  DynareWidget,
  DocumentModel
> {
  constructor(options: DocumentRegistry.IWidgetFactoryOptions) {
    super(options);
  }

  /**
   * Create new DynareWidget given a context (file info)
   */
  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentModel>
  ): DynareWidget {
    return new DynareWidget({
      context,
      content: new SolutionWidget(context)
    });
  }
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
  requires: [ILayoutRestorer, IDefaultFileBrowser, ILauncher],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    browserFactory: IDefaultFileBrowser,
    launcher: ILauncher
  ) => {
    console.log('JupyterLab extension jupyter-dynare is activated!');
    const { commands, shell } = app;
    // Tracker
    const namespace = 'jupyterlab-dynare';
    const tracker = new WidgetTracker<DynareWidget>({ namespace });
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
    const widgetFactory = new DynareWidgetFactory({
      name: FACTORY,
      fileTypes: ['mod'],
      defaultFor: ['mod']
    });

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
    // Add command for creating new mod file
    commands.addCommand('mod:create-new', {
      label: 'Create new mod file',
      caption: 'Create a new mod file',
      execute: () => {
        const cwd = browserFactory.model.path;
        commands
          .execute('docmanager:new-untitled', {
            path: cwd,
            type: 'file',
            ext: '.mod'
          })
          .then(model =>
            commands.execute('docmanager:open', {
              path: model.path,
              factory: FACTORY
            })
          );
      }
    });

    const CREATE_NEW_CMD = 'mod:create-new';

    // Add launcher item if launcher is available
    if (launcher) {
      launcher.add({
        command: CREATE_NEW_CMD,
        category: 'Other',
        rank: 20
      });
    }

    // // Add palette item if palette is available
    // if (palette) {
    //   palette.addItem({
    //     command: CREATE_NEW_CMD,
    //     category: FACTORY
    //   });
    // }
  }
};

export default plugin;
