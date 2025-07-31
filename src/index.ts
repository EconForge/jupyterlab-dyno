import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyter-dynare extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-dynare:plugin',
  description: 'A JupyterLab extension for solving Dynare models',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyter-dynare is activated!');
  }
};

export default plugin;
