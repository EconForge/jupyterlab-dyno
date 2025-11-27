import { Widget } from '@lumino/widgets';
import { Signal } from '@lumino/signaling';

export interface IDynoFileOptions {
  order?: number;
  steady_state_only?: boolean;
  preserveScrollPosition?: boolean; // mirrors global setting override per file
}

export interface ITutorialTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

/**
 * Sidebar panel allowing user to set per-file options.
 */
export class DynoOptionsPanel extends Widget {
  constructor() {
    super();
    this.id = 'dyno-options-panel';
    this.title.label = 'Dyno Tutor';
    this.title.caption = 'Dyno file-specific options';
    this.title.closable = true;
    this.addClass('jp-DynoOptionsPanel');
    this._initializeTutorialTasks();
    this._render();
  }

  /** Emitted whenever options change */
  get changed() { return this._changed; }

  /** Set options programmatically (e.g., when switching documents) */
  setOptions(opts: IDynoFileOptions | undefined) {
    this._options = { ...this._options, ...(opts || {}) };
    this._syncForm();
  }

  /** Current options snapshot */
  getOptions(): IDynoFileOptions {
    return { ...this._options };
  }

  /** Initialize tutorial tasks */
  private _initializeTutorialTasks() {
    this._tutorialTasks = [
      {
        id: 'declare-variables',
        title: 'Declare Variables',
        description: 'Start by declaring your model variables using the "variables" block.',
        completed: false
      },
      {
        id: 'define-parameters',
        title: 'Define Parameters',
        description: 'Add a "parameters" block to define your model parameters.',
        completed: false
      },
      {
        id: 'write-equations',
        title: 'Write Equations',
        description: 'Define your model equations in the "model" block.',
        completed: false
      },
      {
        id: 'set-calibration',
        title: 'Set Calibration',
        description: 'Provide initial values for parameters and variables.',
        completed: false
      },
      {
        id: 'run-simulation',
        title: 'Run Simulation',
        description: 'Execute your model to see the results!',
        completed: false
      }
    ];
  }

  /** Mark a task as completed */
  completeTask(taskId: string) {
    const task = this._tutorialTasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      task.completed = true;
      this._render();
    }
  }

  /** Get current active task (first incomplete task) */
  private _getCurrentTask(): ITutorialTask | null {
    return this._tutorialTasks.find(t => !t.completed) || null;
  }

  private _render() {
    const node = this.node;
    node.innerHTML = '';
    
    // Create main container
    const container = document.createElement('div');
    container.className = 'dyno-tutor-container';

    // Tutorial Section
    const tutorialSection = this._createTutorialSection();
    container.appendChild(tutorialSection);

    // Divider
    const divider = document.createElement('hr');
    divider.className = 'dyno-tutor-divider';
    container.appendChild(divider);

    // Options Section
    const optionsSection = this._createOptionsSection();
    container.appendChild(optionsSection);

    node.appendChild(container);
  }

  private _createTutorialSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dyno-tutor-section';

    // Title with tutor image
    const header = document.createElement('div');
    header.className = 'dyno-tutor-header';
    
    const tutorImage = document.createElement('img');
    tutorImage.className = 'dyno-tutor-image';
    tutorImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    tutorImage.alt = 'Tutor';
    // Use relative path to load the actual tutor.png
    tutorImage.src = new URL('../style/tutor.png', import.meta.url).href;
    
    const title = document.createElement('h2');
    title.className = 'dyno-tutor-title';
    title.textContent = 'Tutorial Guide';
    
    header.appendChild(tutorImage);
    header.appendChild(title);
    section.appendChild(header);

    // Current task highlight
    const currentTask = this._getCurrentTask();
    if (currentTask) {
      const currentTaskBox = document.createElement('div');
      currentTaskBox.className = 'dyno-tutor-current-task';
      
      const currentTitle = document.createElement('div');
      currentTitle.className = 'dyno-tutor-current-task-title';
      currentTitle.textContent = '📍 Current Task';
      
      const taskTitle = document.createElement('div');
      taskTitle.className = 'dyno-tutor-task-name';
      taskTitle.textContent = currentTask.title;
      
      const taskDesc = document.createElement('div');
      taskDesc.className = 'dyno-tutor-task-description';
      taskDesc.textContent = currentTask.description;
      
      currentTaskBox.appendChild(currentTitle);
      currentTaskBox.appendChild(taskTitle);
      currentTaskBox.appendChild(taskDesc);
      section.appendChild(currentTaskBox);
    }

    // Task list
    const taskList = document.createElement('div');
    taskList.className = 'dyno-tutor-task-list';
    
    const taskListTitle = document.createElement('div');
    taskListTitle.className = 'dyno-tutor-task-list-title';
    taskListTitle.textContent = 'Progress';
    taskList.appendChild(taskListTitle);

    this._tutorialTasks.forEach((task) => {
      const taskItem = document.createElement('div');
      taskItem.className = `dyno-tutor-task-item ${task.completed ? 'completed' : ''}`;
      
      const checkbox = document.createElement('span');
      checkbox.className = 'dyno-tutor-checkbox';
      checkbox.textContent = task.completed ? '✅' : '⬜';
      
      const label = document.createElement('span');
      label.className = 'dyno-tutor-task-label';
      label.textContent = task.title;
      
      taskItem.appendChild(checkbox);
      taskItem.appendChild(label);
      
      // Make clickable to toggle (for demo purposes)
      taskItem.addEventListener('click', () => {
        task.completed = !task.completed;
        this._render();
      });
      
      taskList.appendChild(taskItem);
    });

    section.appendChild(taskList);

    // Motivational message
    const completedCount = this._tutorialTasks.filter(t => t.completed).length;
    const totalCount = this._tutorialTasks.length;
    
    if (completedCount === totalCount) {
      const congrats = document.createElement('div');
      congrats.className = 'dyno-tutor-congrats';
      congrats.textContent = '🎉 Congratulations! You\'ve completed all tutorial tasks!';
      section.appendChild(congrats);
    } else {
      const progress = document.createElement('div');
      progress.className = 'dyno-tutor-progress';
      progress.textContent = `${completedCount}/${totalCount} tasks completed`;
      section.appendChild(progress);
    }

    return section;
  }

  private _createOptionsSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dyno-options-section';

    const optionsTitle = document.createElement('h3');
    optionsTitle.className = 'dyno-options-title';
    optionsTitle.textContent = 'Model Options';
    section.appendChild(optionsTitle);

    const form = document.createElement('form');
    form.className = 'dyno-options-form';

    // Order input
    const orderLabel = document.createElement('label');
    orderLabel.textContent = 'Order:';
    orderLabel.htmlFor = 'dyno-order';
    const orderInput = document.createElement('input');
    orderInput.id = 'dyno-order';
    orderInput.type = 'number';
    orderInput.min = '1';
    orderInput.max = '6';
    orderInput.step = '1';
    orderInput.value = String(this._options.order ?? 1);
    orderInput.addEventListener('change', () => {
      const v = parseInt(orderInput.value, 10);
      if (!isNaN(v)) {
        this._options.order = v;
        this._changed.emit(this.getOptions());
      }
    });

    // steady_state_only checkbox
    const ssLabel = document.createElement('label');
    ssLabel.textContent = 'Steady state only';
    ssLabel.htmlFor = 'dyno-steady';
    const ssInput = document.createElement('input');
    ssInput.id = 'dyno-steady';
    ssInput.type = 'checkbox';
    ssInput.checked = !!this._options.steady_state_only;
    ssInput.addEventListener('change', () => {
      this._options.steady_state_only = ssInput.checked;
      this._changed.emit(this.getOptions());
    });

    // preserve scroll position (override global)
    const scrollLabel = document.createElement('label');
    scrollLabel.textContent = 'Preserve scroll';
    scrollLabel.htmlFor = 'dyno-scroll';
    const scrollInput = document.createElement('input');
    scrollInput.id = 'dyno-scroll';
    scrollInput.type = 'checkbox';
    scrollInput.checked = this._options.preserveScrollPosition !== false; // default true
    scrollInput.addEventListener('change', () => {
      this._options.preserveScrollPosition = scrollInput.checked;
      this._changed.emit(this.getOptions());
    });

    const fieldset = document.createElement('fieldset');
    fieldset.appendChild(orderLabel);
    fieldset.appendChild(orderInput);

    const ssWrapper = document.createElement('div');
    ssWrapper.appendChild(ssInput);
    ssWrapper.appendChild(ssLabel);

    const scrollWrapper = document.createElement('div');
    scrollWrapper.appendChild(scrollInput);
    scrollWrapper.appendChild(scrollLabel);

    fieldset.appendChild(ssWrapper);
    fieldset.appendChild(scrollWrapper);

    form.appendChild(fieldset);
    section.appendChild(form);
    
    return section;
  }

  private _syncForm() {
    // Re-render simpler than syncing individual values
    this._render();
  }

  private _options: IDynoFileOptions = { order: 1, steady_state_only: false };
  private _changed = new Signal<this, IDynoFileOptions>(this);
  private _tutorialTasks: ITutorialTask[] = [];
}
