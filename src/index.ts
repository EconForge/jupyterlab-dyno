import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { KernelManager, Kernel } from '@jupyterlab/services';

import { IMimeBundle } from '@jupyterlab/nbformat';

import { Widget } from '@lumino/widgets';

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'text/mod';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'mimerenderer-mod';

/**
 * A widget for rendering mod.
 */
export class OutputWidget extends Widget implements IRenderMime.IRenderer {
  /**
   * Construct a new output widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super();
    this._mimeType = options.mimeType;
    this.addClass(CLASS_NAME);
    let manager = new KernelManager();
    this.connection = manager.startNew({name: 'prod'});
  }

  /**
   * Render mod into this widget's node.
   */
  renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    let start = performance.now();
    this.node.style.setProperty("overflow", "auto");
    const data = model.data[this._mimeType] as string;
    // let code_content = `from dyno.modfile import Modfile\nm=Modfile(txt='''${data}''')\nm.solve()`;
    let code_content = `from time import time\nt0 = time()\nfrom dyno.modfile import Modfile\nt1 = time()\nm=Modfile(txt='''${data}''')\nt2 = time()\ns=m.solve()\nt3 = time()\nhtml = s._repr_html_()\nt4 = time()\nprint(f'Module import: {(t1-t0)*1000} ms\\nModel construction: {(t2-t1)*1000} ms\\nModel solving: {(t3-t2)*1000} ms\\nConversion to html: {(t4-t3)*1000} ms\\n->Python total: {(t4-t0)*1000} ms')\nhtml`;
    this.connection.then(conn => {
      let future = conn.requestExecute({ code: code_content } );
      future.onIOPub = (msg) => {
              let end = performance.now();
              // console.log(msg);
              if (msg.header.msg_type == "execute_result" && 'data' in msg.content) {
                  let result = msg.content.data as IMimeBundle;
                  this.node.innerHTML = result['text/html'] as string;
                  console.log(`Took ${end-start} milliseconds to render mod file`);
                }
              else if(msg.header.msg_type == "error" && 'ename' in msg.content && 'evalue' in msg.content){
                this.node.innerHTML = `Failed to solve mod file due to ${msg.content.ename} <br> ${msg.content.evalue}`;
                console.log(`Took ${end-start} milliseconds to show error message`);
              }
              else if(msg.header.msg_type == "stream" && 'text' in msg.content){
                console.log(msg.content.text);
              }
              
          };
      }
    );
    return Promise.resolve();
  }
  private connection: Promise<Kernel.IKernelConnection>;
  private _mimeType: string;
}

/**
 * A mime renderer factory for mod data.
 */
export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: true,
  mimeTypes: [MIME_TYPE],
  createRenderer: options => new OutputWidget(options)
};

/**
 * Extension definition.
 */
const extension: IRenderMime.IExtension = {
  id: 'jupyter_dynare:plugin',
  // description: 'Adds MIME type renderer for mod content',
  rendererFactory,
  rank: 100,
  dataType: 'string',
  fileTypes: [
    {
      name: 'mod',
      mimeTypes: [MIME_TYPE],
      extensions: ['.mod']
    }
  ],
  documentWidgetFactoryOptions: {
    name: 'Dynare viewer',
    primaryFileType: 'mod',
    fileTypes: ['mod'],
    defaultFor: ['mod']
  }
};

export default extension;
