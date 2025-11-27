import { Widget } from '@lumino/widgets';
import { Signal } from '@lumino/signaling';

export interface IDynoFileOptions {
  order?: number;
  steady_state_only?: boolean;
  preserveScrollPosition?: boolean; // mirrors global setting override per file
  irf_type?: 'level' | 'deviation' | 'log-deviation';
  irf_horizon?: number;
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
    orderLabel.textContent = 'Approximation Order:';
    orderLabel.htmlFor = 'dyno-order';
    const orderInput = document.createElement('input');
    orderInput.id = 'dyno-order';
    orderInput.type = 'number';
    orderInput.min = '1';
    orderInput.max = '1';
    orderInput.step = '1';
    orderInput.value = String(this._options.order ?? 1);
    orderInput.addEventListener('change', () => {
      const v = parseInt(orderInput.value, 10);
      if (!isNaN(v)) {
        this._options.order = v;
        this._changed.emit(this.getOptions());
      }
    });

    // IRF Type select
    const irfLabel = document.createElement('label');
    irfLabel.textContent = 'Simuation Type:';
    irfLabel.htmlFor = 'dyno-irf-type';
    const irfSelect = document.createElement('select');
    irfSelect.id = 'dyno-irf-type';
    
    const irfOptions = [
      { value: 'level', text: 'Level' },
      { value: 'deviation', text: 'Deviation' },
      { value: 'log-deviation', text: 'Log-Deviation' }
    ];

    irfOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === (this._options.irf_type || 'level')) {
        option.selected = true;
      }
      irfSelect.appendChild(option);
    });

    irfSelect.addEventListener('change', () => {
      this._options.irf_type = irfSelect.value as any;
      this._changed.emit(this.getOptions());
    });

    // Horizon input
    const horizonLabel = document.createElement('label');
    horizonLabel.textContent = 'Horizon:';
    horizonLabel.htmlFor = 'dyno-horizon';
    const horizonInput = document.createElement('input');
    horizonInput.id = 'dyno-horizon';
    horizonInput.type = 'number';
    horizonInput.min = '1';
    horizonInput.step = '1';
    horizonInput.value = String(this._options.irf_horizon ?? 40);
    horizonInput.addEventListener('change', () => {
      const v = parseInt(horizonInput.value, 10);
      if (!isNaN(v)) {
        this._options.irf_horizon = v;
        this._changed.emit(this.getOptions());
      }
    });

    // steady_state_only checkbox
    const ssLabel = document.createElement('label');
    ssLabel.textContent = 'Recompute Steady-State';
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
    
    const irfWrapper = document.createElement('div');
    irfWrapper.style.marginTop = '10px';
    irfWrapper.style.marginBottom = '10px';
    irfWrapper.appendChild(irfLabel);
    irfWrapper.appendChild(irfSelect);
    fieldset.appendChild(irfWrapper);

    const horizonWrapper = document.createElement('div');
    horizonWrapper.style.marginBottom = '10px';
    horizonWrapper.appendChild(horizonLabel);
    horizonWrapper.appendChild(horizonInput);
    fieldset.appendChild(horizonWrapper);

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

  private _options: IDynoFileOptions = { order: 1, steady_state_only: false, irf_type: 'level', irf_horizon: 40 };
  private _changed = new Signal<this, IDynoFileOptions>(this);
}
