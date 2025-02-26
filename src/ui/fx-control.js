import XfAbstractControl from './abstract-control.js';
import {
  evaluateXPath,
  evaluateXPathToString,
  evaluateXPathToFirstNode,
} from '../xpath-evaluation.js';
import getInScopeContext from '../getInScopeContext.js';
import { Fore } from '../fore.js';
import {ModelItem} from "../modelitem.js";
import {debounce} from "../events.js";
import {FxModel} from "../fx-model";

const WIDGETCLASS = 'widget';

/**
 * `fx-control`
 * a generic wrapper for controls
 *
 *
 *
 * @customElement
 * @demo demo/index.html
 */

/*
function debounce( func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}
*/
export default class FxControl extends XfAbstractControl {
  constructor() {
    super();
    this.inited = false;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.initial = this.hasAttribute('initial') ? this.getAttribute('initial') : null;
    this.url = this.hasAttribute('url') ? this.getAttribute('url') : null;
    this.loaded = false;
    this.initialNode = null;
    this.debounceDelay = this.hasAttribute('debounce') ? this.getAttribute('debounce') : null;

    this.updateEvent = this.hasAttribute('update-event')
      ? this.getAttribute('update-event')
      : 'blur';
    this.valueProp = this.hasAttribute('value-prop') ? this.getAttribute('value-prop') : 'value';
    this.label = this.hasAttribute('label') ? this.getAttribute('label') : null;
    const style = `
            :host{
                display:inline-block;
            }
        `;

    this.shadowRoot.innerHTML = `
            <style>
                ${style}
            </style>
            ${this.renderHTML(this.ref)}
        `;

    this.widget = this.getWidget();
    // console.log('widget ', this.widget);
    let listenOn = this.widget // default: usually listening on widget

    if(this.hasAttribute('listen-on')){
      const q = this.getAttribute('listen-on');
      const target = this.querySelector(q);
      if(target){
        listenOn = target;
      }
    }


    this.addEventListener('keyup', event => {
      FxModel.dataChanged = true;
    });
    // ### convenience marker event
    if (this.updateEvent === 'enter') {
      this.widget.addEventListener('keyup', event => {
        if (event.keyCode === 13) {
          // console.info('handling Event:', event.type, listenOn);
          // Cancel the default action, if needed
          event.preventDefault();
          this.setValue(this.widget[this.valueProp]);
        }
      });
      this.updateEvent = 'blur'; // needs to be registered too
    }
    if (this.debounceDelay) {
      listenOn.addEventListener(
        this.updateEvent,
        debounce(this,() => {
          // console.log('eventlistener ', this.updateEvent);
          // console.info('handling Event:', event.type, listenOn);
          this.setValue(this.widget[this.valueProp]);
        }, this.debounceDelay),
      );
    } else {
      listenOn.addEventListener(this.updateEvent, () => {
        // console.info('handling Event:', event.type, listenOn);
        this.setValue(this.widget[this.valueProp]);
      });
    }

    this.addEventListener('return', e => {
      console.log('catched return action on ', this);
      console.log('return detail', e.detail);

      console.log('return triggered on ', this);
      console.log('this.ref', this.ref);
      console.log('current outer instance', this.getInstance());

      console.log(
        '???? why ???? current nodeset should point to the node of the outer control',
        e.currentTarget.nodeset,
      );
      console.log(
        '???? why ???? current nodeset should point to the node of the outer control',
        this.nodeset,
      );
      const newNodes = e.detail.nodeset;
      console.log('new nodeset', newNodes);
      console.log('currentTarget', e.currentTarget);
      console.log('target', e.target);

      e.stopPropagation();

      this._replaceNode(newNodes);
    });

    this.template = this.querySelector('template');
    this.boundInitialized = false;
    this.static = this.widget.hasAttribute('static')? true:false;
    // console.log('template',this.template);
  }

  _debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(() => {
        func.apply(context, args);
      }, timeout);
    };
  }

  /**
   * updates the model with a new value by executing it's `<fx-setvalue>` action.
   *
   * In case the `as='node'` is given the bound node is replaced with the widgets' value with is
   * expected to be a node again.
   *
   * @param val the new value to be set
   */
  setValue(val) {
    const modelitem = this.getModelItem();

    this.classList.add('visited');

    if (modelitem?.readonly){
      console.warn('attempt to change readonly node', modelitem);
      return; // do nothing when modelItem is readonly
    }

    if (this.getAttribute('as') === 'node') {
      const widgetValue = this.getWidget().value;
      const replace = this.shadowRoot.getElementById('replace');
      replace.replace(this.nodeset, this.getWidget().value);
      if (modelitem && widgetValue && widgetValue !== modelitem.value) {
        modelitem.value = widgetValue;
        FxModel.dataChanged = true;
        replace.actionPerformed();
      }
      return;
    }
    const setval = this.shadowRoot.getElementById('setvalue');
    setval.setValue(modelitem, val);

    if (this.modelItem instanceof ModelItem && !this.modelItem?.boundControls.includes(this)) {
      this.modelItem.boundControls.push(this);
    }

    setval.actionPerformed();
    this.visited = true;
  }

  _replaceNode(node) {
    // Note: clone the node while replacing to prevent the instances to leak through
    this.modelItem.node.replaceWith(node.cloneNode(true));
    this.getOwnerForm().refresh();
  }

  renderHTML(ref) {
    return `
            ${this.label ? `${this.label}` : ''}
            <slot></slot>
            ${
              this.hasAttribute('as') && this.getAttribute('as') === 'node'
                ? `<fx-replace id="replace" ref=".">`
                : `<fx-setvalue id="setvalue" ref="${ref}"></fx-setvalue>`
            }

        `;
  }

  /**
   * The widget is the actual control being used in the UI e.g. a native input control or any
   * other component that presents a control that can be interacted with.
   *
   * This function returns the widget by querying the children of this control for an element
   * with `class="widget"`. If that cannot be found it searches for an native `input` of any type.
   * If either cannot be found a `<input type="text">` is created.
   *
   * @returns {HTMLElement|*}
   */
  getWidget() {
    if (this.widget) return this.widget;
    let widget = this.querySelector(`.${WIDGETCLASS}`);
    if (!widget) {
      widget = this.querySelector('input');
    }
    if (!widget) {
      const input = document.createElement('input');
      input.classList.add(WIDGETCLASS);
      input.setAttribute('type', 'text');
      this.appendChild(input);
      return input;
    }
    return widget;
  }

  /**
   * updates the widget from the modelItem value. During refresh the a control
   * evaluates it's binding expression to determine the bound node. The bound node corresponds
   * to a modelItem which acts a the state object of a node. The modelItem determines the value
   * and the state of the node and set the `value` property of this class.
   *
   * @returns {Promise<void>}
   */
  async updateWidgetValue() {
    // this.widget[this.valueProp] = this.value;

    let { widget } = this;
    if (!widget) {
      widget = this;
    }
    // ### value is bound to checkbox
    if (this.valueProp === 'checked') {
      if (this.value === 'true') {
        widget.checked = true;
      } else {
        widget.checked = false;
      }
      return;
    }

    if (this.hasAttribute('as')) {
      const as = this.getAttribute('as');

      // ### when there's an `as=text` attribute serialize nodeset to prettified string
      if (as === 'text') {
        const serializer = new XMLSerializer();
        const pretty = Fore.prettifyXml(serializer.serializeToString(this.nodeset));
        widget.value = pretty;
      }
      if (as === 'node' && this.nodeset !== widget.value) {
        // const oldVal = this.nodeset.innerHTML;
        const oldVal = this.nodeset;
        if (widget.value) {
          if (oldVal !== this.widget.value) {
            console.log('changed');
            widget.value = this.nodeset.cloneNode(true);
            return;
          }
        }

        widget.value = this.nodeset.cloneNode(true);
        // todo: should be more like below but that can cause infinite loop when controll trigger update event due to calling a setter for property
        // widget[this.valueProp] = this.nodeset.cloneNode(true);
        // console.log('passed value to widget', widget.value);
      }

      return;
    }

    // ### when there's a url Fore is used as widget and will be loaded from external file
    if (this.url && !this.loaded) {
      // ### evaluate initial data if necessary

      if (this.initial) {
        this.initialNode = evaluateXPathToFirstNode(this.initial, this.nodeset, this);
        console.log('initialNodes', this.initialNode);
      }

      // ### load the markup from Url
      await this._loadForeFromUrl();
      this.loaded = true;

      // ### replace default instance of embedded Fore with initial nodes
      // const innerInstance = this.querySelector('fx-instance');
      // console.log('innerInstance',innerInstance);
      return;
    }

    /*
    if(this.url && !this.loaded){
      this._loadForeFromUrl();
      this.loaded=true;
      return;
    }
*/
    if (widget.value !== this.value) {
      widget.value = this.value;
    }
  }

  /**
   * loads an external Fore from an HTML file given by `url` attribute.
   *
   * Will look for the `<fx-fore>` element within the returned HTML file and return that element.
   *
   * If that cannot be found an error is dispatched.
   *
   * todo: dispatch link error
   * @private
   */
  async _loadForeFromUrl() {
    console.log('########## loading Fore from ', this.url, '##########');
    console.info(
        `%cFore is processing URL ${this.url}`,
        "background:#64b5f6; color:white; padding:1rem; display:inline-block; white-space: nowrap; border-radius:0.3rem;width:100%;",
    );
    try {
      const response = await fetch(this.url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Content-Type': 'text/html',
        },
      });

      const responseContentType = response.headers.get('content-type').toLowerCase();
      console.log('********** responseContentType *********', responseContentType);
      let data;
      if (responseContentType.startsWith('text/html')) {
        data = await response.text().then(result =>
          // console.log('xml ********', result);
          new DOMParser().parseFromString(result, 'text/html'),
        );
      } else {
        data = 'done';
      }
      // const theFore = fxEvaluateXPathToFirstNode('//fx-fore', data.firstElementChild);
      const theFore = data.querySelector('fx-fore');
      const imported = document.importNode(theFore,true);

      // console.log('thefore', theFore)
      imported.classList.add('widget'); // is the new widget
      console.log(`########## loaded fore as component ##### ${this.url}`);
      imported.addEventListener(
          'model-construct-done',
          e => {
            console.log('subcomponent ready', e.target);
            const defaultInst = imported.querySelector('fx-instance');
            // console.log('defaultInst', defaultInst);
            if(this.initialNode){
              const doc = new DOMParser().parseFromString('<data></data>', 'application/xml');
              // Note: Clone the input to prevent the inner fore from editing the outer node
              doc.firstElementChild.appendChild(this.initialNode.cloneNode(true));
              // defaultinst.setInstanceData(this.initialNode);
              defaultInst.setInstanceData(doc);
            }
            // console.log('new data', defaultInst.getInstanceData());
            // theFore.getModel().modelConstruct();
            imported.getModel().updateModel();
            imported.refresh();
          },
          { once: true },
      );

      const dummy = this.querySelector('input');
      if (this.hasAttribute('shadow')) {
        dummy.parentNode.removeChild(dummy);
        this.shadowRoot.appendChild(imported);
      } else {
        console.log(this, 'replacing widget with',theFore);
        dummy.replaceWith(imported);
        // this.appendChild(imported);
      }


      if (!theFore) {
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: {
              message: `Fore element not found in '${this.src}'. Maybe wrapped within 'template' element?`,
            },
          }),
        );
      }
      console.log('loaded');
      this.dispatchEvent(new CustomEvent('loaded', { detail: { fore: theFore } }));
    } catch (error) {
      console.log('error', error);
      this.getOwnerForm().dispatchEvent(
        new CustomEvent('error', { detail: { message: `${this.url} not found` } }),
      );
    }
  }

  getTemplate() {
    return this.querySelector('template');
  }

  async refresh(force) {
    // console.log('fx-control refresh', this);
    super.refresh(force);
    // console.log('refresh template', this.template);
    // const {widget} = this;

    // ### if we find a ref on control we have a 'select' control of some kind
    const widget = this.getWidget();
    this._handleBoundWidget(widget);
    Fore.refreshChildren(this, force);
  }

  /**
   * If the widget itself has a `ref` it binds to another nodeset to provide some
   * dynamic items to be created from a template usually. Examples are dynamic select option lists
   * or a set of checkboxes.
   *
   * @param widget the widget to handle
   * @private
   */
  _handleBoundWidget(widget) {
    if(this.boundInitialized && this.static) return;

    if (widget && widget.hasAttribute('ref')) {
      // ### eval nodeset for list control
      const ref = widget.getAttribute('ref');
      /*
      actually a ref on a select or similar component should point to a different instance
      with an absolute expr e.g. 'instance('theId')/...'

      todo: even bail out if ref is not absolute?
       */

      const inscope = getInScopeContext(this, ref);
      // const nodeset = evaluateXPathToNodes(ref, inscope, this);
      const nodeset = evaluateXPath(ref, inscope, this);

      // ### bail out when nodeset is array and empty
      if (Array.isArray(nodeset) && nodeset.length === 0) return;

      // ### clear items
      const { children } = widget;
      Array.from(children).forEach(child => {
        if (child.nodeName.toLowerCase() !== 'template') {
          child.parentNode.removeChild(child);
        }
      });

      // ### build the items
      if (this.template) {
        if(this.widget.nodeName === "SELECT" &&
            this.widget.hasAttribute('selection') &&
            this.widget.getAttribute('selection') === 'open'){
          const firstTemplateChild=this.template.firstElementChild;
          const option = document.createElement('option');
          this.widget.insertBefore(option,firstTemplateChild);
        }

        if (nodeset.length) {
          // console.log('nodeset', nodeset);
          const fragment = document.createDocumentFragment();
          // console.time('offscreen');
/*
          Array.from(nodeset).forEach(node => {
            // console.log('#### node', node);
            const newEntry = this.createEntry();
            this.template.parentNode.appendChild(newEntry);
            // ### initialize new entry
            // ### set value
            this.updateEntry(newEntry, node);
          });
*/
          // this should actually perform better than the above but does not seem to make a measurable difference.
          Array.from(nodeset).forEach(node => {
            // console.log('#### node', node);
            const newEntry = this.createEntry();
            fragment.appendChild(newEntry);

            // ### initialize new entry
            // ### set value
            this.updateEntry(newEntry, node);
          });
          this.template.parentNode.appendChild(fragment);
          // console.timeEnd('offscreen');
        } else {
          const newEntry = this.createEntry();
          this.template.parentNode.appendChild(newEntry);
          this.updateEntry(newEntry, nodeset);
        }
        this.boundInitialized = true;
      }
    }
  }

  updateEntry(newEntry, node) {
    // ### >>> todo: needs rework this code is heavily assuming a select control with 'value' attribute - not generic at all yet.

    if (this.widget.nodeName !== 'SELECT') return;
    const valueAttribute = this._getValueAttribute(newEntry);
    const valueExpr = valueAttribute.value;
    const cutted = valueExpr.substring(1, valueExpr.length - 1);
    const evaluated = evaluateXPathToString(cutted, node, newEntry);
    valueAttribute.value = evaluated;

    if (this.value === evaluated) {
      newEntry.setAttribute('selected', 'selected');
    }

    // ### set label
    const optionLabel = newEntry.textContent;
    const labelExpr = optionLabel.substring(1, optionLabel.length - 1);

    const label = evaluateXPathToString(labelExpr, node, newEntry);
    newEntry.textContent = label;
    //  ### <<< needs rework
  }

  createEntry() {
    return this.template.content.firstElementChild.cloneNode(true);
    // const content = this.template.content.firstElementChild.cloneNode(true);
    // return content;
    // const newEntry = document.importNode(content, true);
    // this.template.parentNode.appendChild(newEntry);
    // return newEntry;
  }

  // eslint-disable-next-line class-methods-use-this
  _getValueAttribute(element) {
    let result;
    Array.from(element.attributes).forEach(attribute => {
      const attrVal = attribute.value;
      if (attrVal.indexOf('{') !== -1) {
        // console.log('avt found ', attribute);
        result = attribute;
      }
    });
    return result;
  }
}
if (!customElements.get('fx-control')) {
  window.customElements.define('fx-control', FxControl);
}
