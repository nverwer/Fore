import { AbstractAction } from './abstract-action.js';
import {evaluateXPathToString} from "../xpath-evaluation";
import {Fore} from "../fore";
import getInScopeContext from '../getInScopeContext.js';

/**
 * `fx-message`
 *
 * Action to display messages to the user.
 *
 *
 */
class FxMessage extends AbstractAction {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    super.connectedCallback();
    this.event = this.hasAttribute('event') ? this.getAttribute('event') : '';
    this.level = this.hasAttribute('level') ? this.getAttribute('level') : 'ephemeral';

	this.messageTextContent = this.textContent;
    const style = `
        :host{
            display:none;
        }
    `;
    this.shadowRoot.innerHTML = `
        <style>
            ${style}
        </style>
        ${this.renderHTML()}
    `;
  }

/*
  disconnectedCallback() {
    // super.disconnectedCallback();
    this.targetElement.removeEventListener(this.event, e => this.execute(e));
  }
*/

  // eslint-disable-next-line class-methods-use-this
  renderHTML() {
    return `
        <slot></slot>
    `;
  }

  async perform() {
    super.perform();
    let message;
    if (this.hasAttribute('value')) {
      message = this._getValue();
    } else {
		this.getOwnerForm().evaluateTemplateExpression(this.messageTextContent, this.firstChild);
      message = this.textContent;
    }

    this.dispatchEvent(
      new CustomEvent('message', {
        composed: true,
        bubbles: true,
        detail: { level: this.level, message },
      }),
    );
  }

  _getValue() {
    if (this.hasAttribute('value')) {
      const valAttr = this.getAttribute('value');
      try {
        const inscopeContext = getInScopeContext(this, valAttr);
        return evaluateXPathToString(valAttr, inscopeContext, this);
      } catch (error) {
        console.error(error);
        Fore.dispatch(this, 'error', { message: error });
      }
    }
    if (this.textContent) {
      return this.textContent;
    }
    return null;
  }

}

if (!customElements.get('fx-message')) {
  window.customElements.define('fx-message', FxMessage);
}
