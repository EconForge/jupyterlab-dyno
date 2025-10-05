import { Widget } from '@lumino/widgets';
import { Signal } from '@lumino/signaling';

export interface IDynoFileOptions {
  order?: number;
  steady_state_only?: boolean;
  preserveScrollPosition?: boolean; // mirrors global setting override per file
}

/**
 * Sidebar panel allowing user to set per-file options.
 */
export class DynoOptionsPanel extends Widget {
  constructor() {
    super();
    this.id = 'dyno-options-panel';
    this.title.label = 'Dyno Options';
    this.title.caption = 'Dyno file-specific options';
    this.title.closable = true;
    this.addClass('jp-DynoOptionsPanel');
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

  private _render() {
    const node = this.node;
    node.innerHTML = '';
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
    node.appendChild(form);
  }

  private _syncForm() {
    // Re-render simpler than syncing individual values
    this._render();
  }

  private _options: IDynoFileOptions = { order: 1, steady_state_only: false };
  private _changed = new Signal<this, IDynoFileOptions>(this);
}
