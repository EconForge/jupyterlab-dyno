import { dinoIcon, DINO_ICON_SVG } from '../icons';
import { LabIcon } from '@jupyterlab/ui-components';
import plugin, { DynareWidget } from '../index';
import { SimplifiedOutputArea, OutputAreaModel } from '@jupyterlab/outputarea';
import { DocumentModel } from '@jupyterlab/docregistry';
import { Signal } from '@lumino/signaling';

describe('dinoIcon', () => {
  it('should be an instance of LabIcon', () => {
    expect(dinoIcon).toBeInstanceOf(LabIcon);
    expect(dinoIcon.name).toBe('jupyterlab-dyno:dino-icon');
  });

  it('should contain a valid SVG string for a dinosaur', () => {
    expect(DINO_ICON_SVG).toContain('<svg');
    expect(DINO_ICON_SVG).toContain('</svg>');
    expect(DINO_ICON_SVG).toContain('viewBox="0 0 36 36"');
  });

  it('should register dyno and dynoYAML file types with dinoIcon in plugin activate', () => {
    const registeredFileTypes: any[] = [];
    const mockApp = {
      commands: {
        addCommand: jest.fn(),
        execute: jest.fn()
      },
      shell: {
        add: jest.fn(),
        activateById: jest.fn()
      },
      serviceManager: {},
      docRegistry: {
        addWidgetFactory: jest.fn(),
        addFileType: jest.fn((ft: any) => {
          registeredFileTypes.push(ft);
        })
      }
    } as any;

    const mockSettings = {
      load: jest.fn().mockResolvedValue({
        composite: {},
        get: jest.fn().mockReturnValue({ composite: undefined }),
        changed: { connect: jest.fn() }
      })
    } as any;

    const mockEditorLanguages = {
      addLanguage: jest.fn()
    } as any;

    plugin.activate(
      mockApp,
      null as any,
      {} as any,
      mockSettings,
      mockEditorLanguages,
      null
    );

    const dynoFileType = registeredFileTypes.find(ft => ft.name === 'dyno');
    expect(dynoFileType).toBeDefined();
    expect(dynoFileType.extensions).toContain('.dyno');
    expect(dynoFileType.icon).toBe(dinoIcon);

    const dynoYamlFileType = registeredFileTypes.find(ft => ft.name === 'dynoYAML');
    expect(dynoYamlFileType).toBeDefined();
    expect(dynoYamlFileType.extensions).toContain('.dyno.yaml');
    expect(dynoYamlFileType.icon).toBe(dinoIcon);
  });

  it('should set title.icon to dinoIcon on DynareWidget for .dyno and .dyno.yaml', () => {
    const createWidget = (path: string) => {
      const pathChangedSignal = new Signal({});
      const model = new DocumentModel();
      const mockContext = {
        path,
        localPath: path,
        ready: Promise.resolve(),
        model,
        pathChanged: pathChangedSignal
      };
      const mockServiceManager = {
        sessions: {
          startNew: jest.fn().mockResolvedValue({})
        },
        kernelspecs: {}
      };
      const mockRendermime = {};

      return new DynareWidget(
        {
          context: mockContext as any,
          content: new SimplifiedOutputArea({ model: new OutputAreaModel(), rendermime: mockRendermime as any })
        },
        mockServiceManager as any,
        mockRendermime as any
      );
    };

    const dynoWidget = createWidget('test.dyno');
    expect(dynoWidget.title.icon).toBe(dinoIcon);

    const yamlWidget = createWidget('test.dyno.yaml');
    expect(yamlWidget.title.icon).toBe(dinoIcon);

    const modWidget = createWidget('test.mod');
    expect(modWidget.title.icon).toBeUndefined();
  });
});

