import { Widget, DockPanel } from '@lumino/widgets';
import { WidgetTracker } from '@jupyterlab/apputils';
import { findTabBarForWidget, openAndPositionEditor, DynareWidget } from '../index';

describe('findTabBarForWidget', () => {
  it('should return null when dock or widget is null', () => {
    expect(findTabBarForWidget(null, null)).toBeNull();
    const w = new Widget();
    expect(findTabBarForWidget(null, w)).toBeNull();
  });

  it('should find the TabBar containing the widget', () => {
    const dock = new DockPanel();
    const w1 = new Widget();
    const w2 = new Widget();

    dock.addWidget(w1);
    dock.addWidget(w2, { mode: 'split-right', ref: w1 });

    const bar1 = findTabBarForWidget(dock, w1);
    const bar2 = findTabBarForWidget(dock, w2);

    expect(bar1).not.toBeNull();
    expect(bar2).not.toBeNull();
    expect(bar1).not.toBe(bar2);

    const w3 = new Widget();
    expect(findTabBarForWidget(dock, w3)).toBeNull();
  });
});

class MockDynoWidget extends Widget {
  context: { path: string };
  editorWidget: Widget | null = null;
  setEditorWidget = jest.fn((editor: any) => {
    this.editorWidget = editor;
  });
  constructor(id: string, path: string) {
    super();
    this.id = id;
    this.context = { path };
  }
}

describe('openAndPositionEditor', () => {
  it('should split-left on first open when no other panels exist', async () => {
    const commandsExecuted: Array<{ command: string; args: any }> = [];
    const mockEditor = new Widget();
    mockEditor.id = 'editor-widget-1';

    const mockCommands = {
      execute: jest.fn(async (command: string, args: any) => {
        commandsExecuted.push({ command, args });
        return mockEditor;
      })
    };

    const shellAdded: Array<{ widget: any; area: string; options: any }> = [];
    const mockShell = {
      widgets: jest.fn(function* () {}),
      add: jest.fn((widget: any, area: string, options: any) => {
        shellAdded.push({ widget, area, options });
      })
    };

    const mockApp = {
      commands: mockCommands,
      shell: mockShell
    } as any;

    const tracker = new WidgetTracker<DynareWidget>({ namespace: 'test' });
    const mockDynoWidget = new MockDynoWidget('dyno-widget-1', 'example1.mod') as any;
    const dock = new DockPanel();
    Widget.attach(dock, document.body);
    dock.addWidget(mockDynoWidget);

    await openAndPositionEditor(mockApp, tracker, mockDynoWidget);

    // Should execute docmanager:open with mode: 'split-left' relative to dyno widget
    expect(mockCommands.execute).toHaveBeenCalledWith('docmanager:open', {
      path: 'example1.mod',
      factory: 'Editor',
      options: {
        mode: 'split-left',
        ref: 'dyno-widget-1'
      }
    });

    expect(mockDynoWidget.setEditorWidget).toHaveBeenCalledWith(mockEditor);
    dock.dispose();
  });

  it('should tab into existing editor and viewer panels when opening a second model', async () => {
    const dock = new DockPanel();
    Widget.attach(dock, document.body);
    const existingEditor = new Widget();
    existingEditor.id = 'editor-1';
    const existingViewer = new MockDynoWidget('viewer-1', 'file1.mod') as any;
    existingViewer.editorWidget = existingEditor;

    dock.addWidget(existingEditor);
    dock.addWidget(existingViewer, { mode: 'split-right', ref: existingEditor });

    const mockEditor2 = new Widget();
    mockEditor2.id = 'editor-2';

    const mockCommands = {
      execute: jest.fn(async () => mockEditor2)
    };

    const shellAdded: Array<{ widget: any; area: string; options: any }> = [];
    const mockShell = {
      widgets: jest.fn(function* () {
        yield existingEditor;
      }),
      add: jest.fn((widget: any, area: string, options: any) => {
        shellAdded.push({ widget, area, options });
        let refWidget = options?.ref;
        if (typeof refWidget === 'string') {
          for (const w of dock.widgets()) {
            if (w.id === refWidget) {
              refWidget = w;
              break;
            }
          }
        }
        dock.addWidget(widget, { ...options, ref: refWidget });
      })
    };

    const mockApp = {
      commands: mockCommands,
      shell: mockShell
    } as any;

    const tracker = new WidgetTracker<DynareWidget>({ namespace: 'test' });
    tracker.add(existingViewer);

    const newViewer = new MockDynoWidget('viewer-2', 'file2.mod') as any;
    // Suppose docmanager initially placed newViewer in the editor panel (because editor was active)
    dock.addWidget(newViewer, { mode: 'tab-after', ref: existingEditor });

    await openAndPositionEditor(mockApp, tracker, newViewer);

    // Should tab new viewer into viewer-1 panel
    expect(mockShell.add).toHaveBeenCalledWith(newViewer, 'main', {
      mode: 'tab-after',
      ref: 'viewer-1'
    });

    // Should open editor-2 tabbed after editor-1 in the editor panel
    expect(mockCommands.execute).toHaveBeenCalledWith('docmanager:open', {
      path: 'file2.mod',
      factory: 'Editor',
      options: {
        mode: 'tab-after',
        ref: 'editor-1'
      }
    });

    expect(newViewer.setEditorWidget).toHaveBeenCalledWith(mockEditor2);
    dock.dispose();
  });

  it('should reuse existing editor and split if in the same panel', async () => {
    const dock = new DockPanel();
    Widget.attach(dock, document.body);
    const existingEditor = new Widget();
    existingEditor.id = 'editor-same-file';
    (existingEditor as any).context = { path: 'file1.mod' };

    const viewer = new MockDynoWidget('viewer-1', 'file1.mod') as any;

    // Both in same panel initially
    dock.addWidget(existingEditor);
    dock.addWidget(viewer, { mode: 'tab-after', ref: existingEditor });

    const mockCommands = {
      execute: jest.fn()
    };

    const mockShell = {
      widgets: jest.fn(function* () {
        yield existingEditor;
        yield viewer;
      }),
      add: jest.fn((widget: any, area: string, options: any) => {
        let refWidget = options?.ref;
        if (typeof refWidget === 'string') {
          for (const w of dock.widgets()) {
            if (w.id === refWidget) {
              refWidget = w;
              break;
            }
          }
        }
        dock.addWidget(widget, { ...options, ref: refWidget });
      })
    };

    const mockApp = {
      commands: mockCommands,
      shell: mockShell
    } as any;

    const tracker = new WidgetTracker<DynareWidget>({ namespace: 'test' });

    await openAndPositionEditor(mockApp, tracker, viewer);

    // Should NOT execute docmanager:open since editor already exists
    expect(mockCommands.execute).not.toHaveBeenCalled();

    // Should move editor to split-left relative to viewer
    expect(mockShell.add).toHaveBeenCalledWith(existingEditor, 'main', {
      mode: 'split-left',
      ref: 'viewer-1'
    });

    expect(viewer.setEditorWidget).toHaveBeenCalledWith(existingEditor);
    dock.dispose();
  });
});

