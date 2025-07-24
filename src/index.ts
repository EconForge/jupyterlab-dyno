import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

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
  }

  /**
   * Render mod into this widget's node.
   */
  renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[this._mimeType] as string;
    this.node.textContent = data.slice(0, 16384);
    return Promise.resolve();
  }

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
