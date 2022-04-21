import XfAbstractControl from './abstract-control.js';
import { evaluateXPath, evaluateXPathToString, evaluateXPathToNodes } from '../xpath-evaluation.js';
import getInScopeContext from '../getInScopeContext.js';
import { Fore } from '../fore.js';

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
export default class FxControl extends XfAbstractControl {
  constructor() {
    super();
    this.inited = false;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.initial = this.hasAttribute('initial')?this.getAttribute('initial'):null;
    this.url = this.hasAttribute('url') ? this.getAttribute('url'):null;
    this.loaded=false;
    this.initialNode = null;

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

    // ### convenience marker event
    if (this.updateEvent === 'enter') {
      this.widget.addEventListener('keyup', event => {
        if (event.keyCode === 13) {
          // Cancel the default action, if needed
          event.preventDefault();
          this.setValue(this.widget[this.valueProp]);
        }
      });
      this.updateEvent = 'blur'; // needs to be registered too
    }
    this.widget.addEventListener(this.updateEvent, () => {
      // console.log('eventlistener ', this.updateEvent);
      this.setValue(this.widget[this.valueProp]);
    });

/*
    const slot = this.shadowRoot.querySelector('slot');
    slot.addEventListener('slotchange', event => {
      const children = event.target.assignedElements();
      if(this.initialNode === null) return;

      console.log('slotchanged for control', children);
      const fore = children.filter(node => node.nodeName === 'FX-FORE');
      console.log('fore',fore);
      if(fore.length !== 0){
        const defaultInstance = fore[0].querySelector('fx-instance');
        console.log('inner instance', defaultInstance);
        defaultInstance.setInstanceData(this.initialNode);
      }
    });
*/
      this.template = this.querySelector('template');
    // console.log('template',this.template);
  }

  /**
   * updates the model with a new value by executing it's `<fx-setvalue>` action.
   *
   * @param val the new value to be set
   */
  setValue(val) {
    const modelitem = this.getModelItem();
    const setval = this.shadowRoot.getElementById('setvalue');
    setval.setValue(modelitem, val);
    setval.actionPerformed();
  }

  renderHTML(ref) {
    return `
            ${this.label ? `${this.label}` : ''}
            <slot></slot>
            <fx-setvalue id="setvalue" ref="${ref}"></fx-setvalue>
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

    // ### when there's an `as=text` attribute serialize nodeset to prettified string
    if(this.hasAttribute('as')){
      const as = this.getAttribute('as');
      if(as === 'text'){
        const serializer = new XMLSerializer();
        const pretty = Fore.prettifyXml(serializer.serializeToString(this.nodeset))
        widget.value = pretty;
      }
      return;
    }

    // ### when there's a url Fore is used as widget and will be loaded from external file
    if(this.url && !this.loaded){
      // ### evaluate initial data if necessary
      if(this.initial){
        this.initialNode = evaluateXPath(this.initial, this.nodeset, this);
        console.log('initialNodes',this.initialNode);
      }

      // ### load the markup from Url
      this._loadForeFromUrl();
      this.loaded=true;


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
    widget.value = this.value;
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
  _loadForeFromUrl() {
    console.log('########## loading Fore from ',this.src ,'##########');
    fetch(this.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'text/html',
      },
    })
        .then(response => {
          const responseContentType = response.headers.get('content-type').toLowerCase();
          console.log('********** responseContentType *********', responseContentType);
          if (responseContentType.startsWith('text/html')) {
            return response.text().then(result =>
                // console.log('xml ********', result);
                new DOMParser().parseFromString(result, 'text/html'),
            );
          }
          return 'done';
        })
        .then(data => {
          // const theFore = fxEvaluateXPathToFirstNode('//fx-fore', data.firstElementChild);
          const theFore = data.querySelector('fx-fore');
          // console.log('thefore', theFore)
          theFore.classList.add('widget'); // is the new widget
          const dummy = this.querySelector('input');
          dummy.replaceWith(theFore);

          theFore.addEventListener('ready',(e)=>{
            console.log('subcomponent ready',e.target);
            const defaultInst = theFore.querySelector('fx-instance');
            console.log('defaultInst',defaultInst);
            const doc = new DOMParser().parseFromString('<data></data>', 'application/xml');
            doc.firstElementChild.appendChild(this.initialNode);
            // defaultInst.setInstanceData(this.initialNode);
            defaultInst.setInstanceData(doc.firstElementChild);
            console.log('new data',defaultInst.getInstanceData());
            theFore.getModel().updateModel();
            theFore.refresh();
          },{once:true});

          if(!theFore){
            this.dispatchEvent(new CustomEvent('error',{detail:{message: `Fore element not found in '${this.src}'. Maybe wrapped within 'template' element?`}}));
          }
          this.dispatchEvent(new CustomEvent('loaded',{}));
        })
        .catch(error => {
          console.log('error',error);
          this.getOwnerForm().dispatchEvent(new CustomEvent('error',{detail:{message:`${this.url} not found`}}));
        });
  }
  getTemplate() {
    return this.querySelector('template');
  }

  async refresh(force) {
    // console.log('fx-control refresh', this);
    super.refresh();
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

      // ### bail out when nodeset is empty
      if(Array.isArray(nodeset) && nodeset.length === 0) return;

      // ### clear items
      const { children } = widget;
      Array.from(children).forEach(child => {
        if (child.nodeName.toLowerCase() !== 'template') {
          child.parentNode.removeChild(child);
        }
      });

      // ### build the items
      if (this.template) {
        if (nodeset.length) {
          // console.log('nodeset', nodeset);
          Array.from(nodeset).forEach(node => {
            // console.log('#### node', node);
            const newEntry = this.createEntry();

            // ### initialize new entry
            // ### set value
            this.updateEntry(newEntry, node);
          });
        } else {
          const newEntry = this.createEntry();
          this.updateEntry(newEntry, nodeset);
        }
      }
    }
  }

  updateEntry(newEntry, node) {
    // ### >>> todo: needs rework this code is heavily assuming a select control with 'value' attribute - not generic at all yet.

    if (this.widget.nodeName !== 'SELECT') return;
    const valueAttribute = this._getValueAttribute(newEntry);
    const valueExpr = valueAttribute.value;
    const cutted = valueExpr.substring(1, valueExpr.length - 1);
    const evaluated = evaluateXPath(cutted, node, newEntry);
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
    const content = this.template.content.firstElementChild.cloneNode(true);
    const newEntry = document.importNode(content, true);
    this.template.parentNode.appendChild(newEntry);
    return newEntry;
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

window.customElements.define('fx-control', FxControl);
