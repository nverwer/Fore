import { evaluateXPathToString, resolveId } from '../xpath-evaluation.js';
import FxControl from './fx-control.js';
import { Fore } from '../fore.js';

/**
 * FxItems provices a templated list over its bound nodes. It is not standalone but expects to be used
 * within an fx-control element.
 *
 *
 *
 * @demo demo/selects3.html
 */
export class FxItems extends FxControl {
  static get properties() {
    return {
      ...super.properties,
      valueAttr: {
        type: String,
      },
    };
  }

  constructor() {
    super();
    this.valueAttr = this.hasAttribute('value') ? this.getAttribute('value') : null;
  }

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('click', e => {
      const items = this.querySelectorAll('[value]');

      let target;
      if (e.target.nodeName === 'LABEL') {
        target = resolveId(e.target.getAttribute('for'), this);
        target.checked = !target.checked;
      }

      let val = '';
      Array.from(items).forEach(item => {
        if (item.checked) {
          val += ` ${item.getAttribute('value')}`;
        }
      });
      this.setAttribute('value', val.trim());

      // ### check for parent control
      const parentBind = Fore.getClosest('[ref]', this.parentNode);
      if (!parentBind) return;
      const modelitem = parentBind.getModelItem();
      const setval = this.shadowRoot.getElementById('setvalue');
      setval.setValue(modelitem, val.trim());
      setval.actionPerformed();
    });
  }

  getWidget() {
    return this;
  }

  async updateWidgetValue() {
    // console.log('setting items value');

    const parentBind = Fore.getClosest('[ref]', this.parentNode);
    if (parentBind) {
      this.value = parentBind.value;
    }
    this.setAttribute('value', this.value);
  }

  /**
   * Updates an entry by setting the label and the value.
   *
   * Will connect label and control with `for` attribute with generated id.
   *
   * attention: limitations here: assumes that there's an `label` element plus an element with an `value`
   * attribute which it will update.
   *
   *
   *
   * @param newEntry
   * @param node
   */
  updateEntry(newEntry, node) {
    // console.log('fx-items updateEntry', this.value);
    // super.updateEntry(newEntry,node);

    // ### danger zone - highly specific - assumes knowledge of the template structure ###
    // ### danger zone - highly specific - assumes knowledge of the template structure ###
    // ### danger zone - highly specific - assumes knowledge of the template structure ###

    const label = newEntry.querySelector('label');
    label.textContent = node.textContent;

    const id = Fore.createUUID();
    label.setAttribute('for', id);

    // getting element which has 'value' attr
    const input = newEntry.querySelector('[value]');
    // getting expr
    const expr = input.value;
    const cutted = expr.substring(1, expr.length - 1);
    const evaluated = evaluateXPathToString(cutted, node, newEntry);

    // adding space around value to allow matching of 'words'
    const spaced = ` ${evaluated} `;

    const valAttr = ` ${this.getAttribute('value')} `;
    input.value = evaluated;
    input.setAttribute('id', id);
    if (valAttr.indexOf(spaced) !== -1) {
      input.checked = true;
    }
  }
}

if (!customElements.get('fx-items')) {
  customElements.define('fx-items', FxItems);
}
